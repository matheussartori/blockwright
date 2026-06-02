// Registers the main-process handlers for the IPC contract in shared/ipc.ts.
import { dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { AssembleOptions, GenerateImage, RenderResult, Workspace, WindowsReport } from '@/shared/types';
import { IPC_CHANNELS, IPC_EVENTS } from '@/shared/ipc';
import { loadStructure } from './structure/load-structure';
import { contentPackVersion, getActiveWorkspace, resolveTextureFile } from './structure/content-pack';
import { assembleJigsaw, jigsawCandidates } from './structure/jigsaw-assembler';
import { aiAvailable, cancelGeneration, generateStructure, resetSession, type CapturePreview } from './ai/generate';
import { credentialInfo, clearCredential, setCredential } from './ai/credentials';
import { structureIdFromPath } from './structure/template-pool';
import { addRecent, clearRecents, getRecents, removeRecent } from './recents';
import { clearRecentWorkspaces, getRecentWorkspaces } from './recent-workspaces';
import {
  activateWorkspace,
  applyWorkspace,
  detectWorkspaceForFile,
  listWorkspaceStructures,
  promptOpenWorkspace,
  setWorkspaceVersion,
} from './workspace';
import { notifyRecentWorkspaces, openFileDialog } from './window';
import { buildAppMenu, refreshMenu, setFileOpen, setWindowsState } from './app-menu';

/** Pending preview-render requests, keyed by requestId, resolved when the
 *  renderer replies on aiRenderResult (see the aiGenerate handler). */
const pendingRenders = new Map<string, (result: RenderResult) => void>();
/** How long to wait for the renderer to return a preview screenshot before
 *  giving up so generation can continue without the visual feedback. */
const RENDER_TIMEOUT_MS = 20000;

export function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.openDialog, async () => openFileDialog());

  ipcMain.handle(IPC_CHANNELS.loadStructure, async (_e, filePath: string) => {
    return loadStructure(filePath);
  });

  ipcMain.handle(IPC_CHANNELS.hasTexture, async (_e, key: string) => {
    const resolved = resolveTextureFile(key);
    return !!resolved && fs.existsSync(resolved.file);
  });

  ipcMain.handle(IPC_CHANNELS.pathExists, async (_e, filePath: string) => {
    return fs.existsSync(filePath);
  });

  // Recents mutations rebuild the native menu and broadcast the new list so the
  // welcome view stays in sync regardless of where the change originated.
  ipcMain.handle(IPC_CHANNELS.recentsList, async () => getRecents());
  ipcMain.handle(IPC_CHANNELS.recentsAdd, async (_e, filePath: string) => {
    const list = addRecent(filePath);
    refreshMenu();
    return list;
  });
  ipcMain.handle(IPC_CHANNELS.recentsRemove, async (_e, filePath: string) => {
    const list = removeRecent(filePath);
    refreshMenu();
    return list;
  });
  ipcMain.handle(IPC_CHANNELS.recentsClear, async () => {
    const list = clearRecents();
    refreshMenu();
    return list;
  });

  ipcMain.handle(IPC_CHANNELS.workspaceOpen, async () => {
    const { workspace, error } = await promptOpenWorkspace();
    if (error) dialog.showErrorBox('Open mod workspace', error);
    buildAppMenu(); // reflect the active workspace in the File menu
    return workspace;
  });
  ipcMain.handle(IPC_CHANNELS.workspaceClose, async () => {
    applyWorkspace(null);
    buildAppMenu();
    return null;
  });
  ipcMain.handle(IPC_CHANNELS.workspaceGet, async () => getActiveWorkspace());
  ipcMain.handle(IPC_CHANNELS.contentVersion, async () => contentPackVersion());
  ipcMain.handle(IPC_CHANNELS.workspaceStructures, async () =>
    listWorkspaceStructures(getActiveWorkspace()),
  );
  ipcMain.handle(IPC_CHANNELS.workspaceActivate, async (_e, ws: Workspace) => {
    const active = activateWorkspace(ws);
    buildAppMenu();
    return active;
  });
  ipcMain.handle(IPC_CHANNELS.workspaceDetectFile, async (_e, filePath: string) =>
    detectWorkspaceForFile(filePath),
  );
  ipcMain.handle(IPC_CHANNELS.recentWorkspacesList, async () => getRecentWorkspaces());
  ipcMain.handle(IPC_CHANNELS.recentWorkspacesClear, async () => {
    const list = clearRecentWorkspaces();
    notifyRecentWorkspaces();
    buildAppMenu();
    return list;
  });
  ipcMain.handle(IPC_CHANNELS.workspaceSetVersion, async (_e, version: string) => {
    const ws = setWorkspaceVersion(version);
    buildAppMenu();
    return ws;
  });

  ipcMain.handle(IPC_CHANNELS.jigsawAssemble, async (_e, filePath: string, options: AssembleOptions) =>
    assembleJigsaw(filePath, structureIdFromPath(filePath), options),
  );
  ipcMain.handle(IPC_CHANNELS.jigsawCandidates, async (_e, filePath: string, index: number) =>
    jigsawCandidates(filePath, index),
  );

  ipcMain.handle(IPC_CHANNELS.aiAvailable, async () => aiAvailable());
  ipcMain.handle(IPC_CHANNELS.aiKeyInfo, async () => credentialInfo());
  ipcMain.handle(IPC_CHANNELS.aiSetKey, async (_e, key: string) => {
    setCredential(key);
    return credentialInfo();
  });
  ipcMain.handle(IPC_CHANNELS.aiClearKey, async () => {
    clearCredential();
    return credentialInfo();
  });
  // Render round-trip for the generator's self-review loop: generate.ts calls the
  // `capture` callback below per emitted version; we ask the renderer (over
  // aiRenderRequest) to load + screenshot it and resolve the matching pending
  // promise when its aiRenderResult reply arrives (or on timeout).
  ipcMain.handle(IPC_CHANNELS.aiRenderResult, async (_e, result: RenderResult) => {
    pendingRenders.get(result.requestId)?.(result);
  });
  ipcMain.handle(IPC_CHANNELS.aiGenerate, async (e, sessionId: string, prompt: string, images?: GenerateImage[]) => {
    const capture: CapturePreview = (path, version) =>
      new Promise((resolve) => {
        const requestId = randomUUID();
        const timer = setTimeout(() => {
          pendingRenders.delete(requestId);
          resolve({ error: 'Preview render timed out.' });
        }, RENDER_TIMEOUT_MS);
        pendingRenders.set(requestId, (res) => {
          clearTimeout(timer);
          pendingRenders.delete(requestId);
          resolve({ images: res.images, error: res.error });
        });
        e.sender.send(IPC_EVENTS.aiRenderRequest, { requestId, path, version });
      });
    return generateStructure(sessionId, prompt, images, (p) => e.sender.send(IPC_EVENTS.aiProgress, p), capture);
  });
  ipcMain.handle(IPC_CHANNELS.aiCancel, async (_e, sessionId: string) => cancelGeneration(sessionId));
  ipcMain.handle(IPC_CHANNELS.aiResetSession, async (_e, sessionId: string) => resetSession(sessionId));

  ipcMain.handle(IPC_CHANNELS.setFileOpen, async (_e, open: boolean) => setFileOpen(open));

  ipcMain.handle(IPC_CHANNELS.windowsReport, async (_e, state: WindowsReport) =>
    setWindowsState(state),
  );

  // Dev-only: the headless capture sets BW_ASSEMBLE so the renderer auto-runs a
  // full assembly. Read from main's env (a sandboxed preload can't see it).
  ipcMain.handle(IPC_CHANNELS.captureConfig, async () =>
    process.env.BW_ASSEMBLE
      ? { depth: Number(process.env.BW_ASSEMBLE_DEPTH) || 6, seed: Number(process.env.BW_ASSEMBLE_SEED) || 1 }
      : null,
  );
}
