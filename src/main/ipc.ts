// Registers the main-process handlers for the IPC contract in shared/ipc.ts.
import { app, dialog, ipcMain, nativeTheme, shell } from 'electron';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { AssembleOptions, BlockNote, BuildSelection, ChatRecord, WorkspaceExportRequest, FloorDef, GenerateImage, ModBlockScope, ModuleCategory, RenderResult, SaveVersionRequest, Workspace, WindowsReport } from '@/shared/types';
import type { LanguagePref } from '@/shared/i18n';
import { getLanguage, setLanguage, mt } from './language';
import { IPC_CHANNELS, IPC_EVENTS } from '@/shared/ipc';
import { loadStructure } from './structure/io/load-structure';
import { isInsideLibrary, librarySidecarPath, metadataFromStructure, readMetadata, writeLoadMetadata } from './structure/metadata';
import { contentPackVersion, getActiveWorkspace, resolveTextureFile } from './structure/assets/content-pack';
import { getContentDir, setContentDir } from './structure/assets/content-dir';
import { clearJsonCache } from './structure/assets/content-pack';
import { clearModelCache } from './structure/assets/model-loader';
import { assembleJigsaw, jigsawCandidates } from './structure/jigsaw/jigsaw-assembler';
import { listCatalog, previewBlock, resolveBlockEntry } from './structure/catalog/block-catalog';
import { saveEditedVersion } from './ai/save-version';
import { getDictionary, setBlockNote, setScope } from './structure/assets/block-dictionary';
import { previewModule } from './structure/catalog/module-preview';
import { listModuleCatalog } from './structure/domain';
import { localizeCatalog } from '@/shared/i18n/registry';
import { aiAvailable, cancelGeneration, generateStructure, resetSession, primeSession, listVersions, type CapturePreview } from './ai/generate';
import { getConfig, setActiveProvider, setModel, setCredential, clearCredential, setGenerationSettings } from './ai/credentials';
import { getOutputDir, setOutputDir } from './ai/output-dir';
import type { AiProviderId, GenerationSettings } from '@/shared/ai';
import { getChat, saveChat } from './chat-history';
import { structureIdFromPath } from './structure/jigsaw/template-pool';
import { addRecent, clearRecents, getRecents, removeRecent } from './recents';
import { clearRecentWorkspaces, getRecentWorkspaces } from './recent-workspaces';
import {
  activateWorkspace,
  applyWorkspace,
  detectWorkspaceForFile,
  listWorkspaceBiomes,
  listWorkspaceStructures,
  promptOpenWorkspace,
  setWorkspaceVersion,
} from './workspace';
import { planExport, runExport } from './export';
import { exportStructure, notifyRecentWorkspaces, openFileDialog } from './window';
import { getLogBacklog } from './logger';
import { buildAppMenu, refreshMenu, setFileOpen, setWindowsState } from './app-menu';

/** Pending preview-render requests, keyed by requestId, resolved when the
 *  renderer replies on aiRenderResult (see the aiGenerate handler). */
const pendingRenders = new Map<string, (result: RenderResult) => void>();
/** How long to wait for the renderer to return a preview screenshot before
 *  giving up so generation can continue without the visual feedback. */
const RENDER_TIMEOUT_MS = 20000;

/** Register every `ipcMain.handle`/`.on` for the app's IPC channels + events (the
 *  renderer↔main bridge). Call once at startup. Channel names come from
 *  `shared/ipc.ts` — never inline them here. */
export function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.openDialog, async () => openFileDialog());

  ipcMain.handle(IPC_CHANNELS.loadStructure, async (_e, filePath: string) => {
    const data = await loadStructure(filePath);
    // A build inside the library has an AUTHORITATIVE sidecar written at generation time
    // (the code-built structure's exact storeys); prefer it over re-detecting, so a
    // flat-roofed villa's floors are labelled exactly instead of guessed.
    if (isInsideLibrary(filePath)) {
      const existing = await readMetadata(librarySidecarPath(filePath));
      if (existing?.floors?.length) return { ...data, floors: existing.floors };
    }
    // Otherwise recognise the storeys + write the `.bw.json` sidecar (temp for a file
    // opened from outside the library, beside it when inside). Best-effort, fire-and-
    // forget; the detected floors ride back on the structure to seed the panel + bands.
    const meta = metadataFromStructure(data);
    void writeLoadMetadata(meta);
    return { ...data, floors: meta.floors };
  });

  ipcMain.handle(IPC_CHANNELS.hasTexture, async (_e, key: string) => {
    const resolved = resolveTextureFile(key);
    return !!resolved && fs.existsSync(resolved.file);
  });

  ipcMain.handle(IPC_CHANNELS.pathExists, async (_e, filePath: string) => {
    return fs.existsSync(filePath);
  });

  // The main-process log backlog buffered before the renderer mounted, so the
  // Console dock opens already populated with the session's history.
  ipcMain.handle(IPC_CHANNELS.logBacklog, async () => getLogBacklog());

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
    if (error) dialog.showErrorBox(mt('dialog.openWorkspaceTitle'), error);
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
  ipcMain.handle(IPC_CHANNELS.contentGetDir, async () => getContentDir());
  ipcMain.handle(IPC_CHANNELS.contentChooseDir, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: getContentDir() ?? undefined,
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const dir = setContentDir(result.filePaths[0]);
    // The new pack changes which assets resolve — drop the resolution caches so the
    // next load reads from it (the renderer re-probes / reopens to pick up textures).
    clearJsonCache();
    clearModelCache();
    return dir;
  });
  ipcMain.handle(IPC_CHANNELS.appVersion, async () => app.getVersion());
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
  ipcMain.handle(IPC_CHANNELS.workspaceBiomes, async () => listWorkspaceBiomes(getActiveWorkspace()));
  ipcMain.handle(IPC_CHANNELS.workspaceExportPlan, async (_e, req: WorkspaceExportRequest) => planExport(req));
  ipcMain.handle(IPC_CHANNELS.workspaceExport, async (_e, req: WorkspaceExportRequest) => runExport(req));

  ipcMain.handle(IPC_CHANNELS.resolveBlock, async (_e, name: string, properties?: Record<string, string>) =>
    resolveBlockEntry(name, properties ?? {}),
  );
  ipcMain.handle(IPC_CHANNELS.saveVersion, async (_e, req: SaveVersionRequest) => saveEditedVersion(req));

  ipcMain.handle(IPC_CHANNELS.jigsawAssemble, async (_e, filePath: string, options: AssembleOptions) =>
    assembleJigsaw(filePath, structureIdFromPath(filePath), options),
  );
  ipcMain.handle(IPC_CHANNELS.jigsawCandidates, async (_e, filePath: string, index: number) =>
    jigsawCandidates(filePath, index),
  );

  ipcMain.handle(IPC_CHANNELS.aiAvailable, async () => aiAvailable());
  ipcMain.handle(IPC_CHANNELS.aiGetConfig, async () => getConfig());
  ipcMain.handle(IPC_CHANNELS.aiSetActiveProvider, async (_e, id: AiProviderId) => {
    setActiveProvider(id);
    return getConfig();
  });
  ipcMain.handle(IPC_CHANNELS.aiSetModel, async (_e, id: AiProviderId, model: string) => {
    setModel(id, model);
    return getConfig();
  });
  ipcMain.handle(IPC_CHANNELS.aiSetCredential, async (_e, id: AiProviderId, secret: string) => {
    setCredential(id, secret);
    return getConfig();
  });
  ipcMain.handle(IPC_CHANNELS.aiClearCredential, async (_e, id: AiProviderId) => {
    clearCredential(id);
    return getConfig();
  });
  ipcMain.handle(IPC_CHANNELS.aiSetGeneration, async (_e, patch: Partial<GenerationSettings>) => {
    setGenerationSettings(patch);
    return getConfig();
  });
  // Render round-trip for the generator's self-review loop: generate.ts calls the
  // `capture` callback below per emitted version; we ask the renderer (over
  // aiRenderRequest) to load + screenshot it and resolve the matching pending
  // promise when its aiRenderResult reply arrives (or on timeout).
  ipcMain.handle(IPC_CHANNELS.aiRenderResult, async (_e, result: RenderResult) => {
    pendingRenders.get(result.requestId)?.(result);
  });
  ipcMain.handle(IPC_CHANNELS.aiGenerate, async (e, sessionId: string, prompt: string, images?: GenerateImage[], selection?: BuildSelection, basePath?: string, floors?: FloorDef[]) => {
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
        e.sender.send(IPC_EVENTS.aiRenderRequest, { requestId, sessionId, path, version });
      });
    return generateStructure({
      sessionId, prompt, images, selection, capture, basePath, floors,
      onProgress: (p) => e.sender.send(IPC_EVENTS.aiProgress, p),
    });
  });
  ipcMain.handle(IPC_CHANNELS.aiCancel, async (_e, sessionId: string) => cancelGeneration(sessionId));
  ipcMain.handle(IPC_CHANNELS.aiResetSession, async (_e, sessionId: string) => resetSession(sessionId));
  ipcMain.handle(IPC_CHANNELS.aiPrimeSession, async (_e, sessionId: string, sdkSessionId: string | null, version: number) =>
    primeSession(sessionId, sdkSessionId, version),
  );
  ipcMain.handle(IPC_CHANNELS.aiListVersions, async (_e, sessionId: string) => listVersions(sessionId));

  ipcMain.handle(IPC_CHANNELS.aiGetOutputDir, async () => getOutputDir());
  ipcMain.handle(IPC_CHANNELS.aiChooseOutputDir, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: getOutputDir(),
    });
    const picked = result.canceled ? null : result.filePaths[0];
    return picked ? setOutputDir(picked) : null;
  });
  ipcMain.handle(IPC_CHANNELS.revealPath, async (_e, target: string) => {
    try {
      fs.mkdirSync(target, { recursive: true });
    } catch {
      /* reveal a path that may already exist / can't be made — let openPath decide */
    }
    await shell.openPath(target);
  });

  ipcMain.handle(IPC_CHANNELS.catalogList, async () => listCatalog());
  ipcMain.handle(IPC_CHANNELS.previewBlock, async (_e, id: string) => previewBlock(id));
  ipcMain.handle(IPC_CHANNELS.dictionaryGet, async () => getDictionary());
  ipcMain.handle(IPC_CHANNELS.dictionarySetNote, async (_e, note: BlockNote) => setBlockNote(note));
  ipcMain.handle(IPC_CHANNELS.dictionarySetScope, async (_e, scope: ModBlockScope) => setScope(scope));
  ipcMain.handle(IPC_CHANNELS.generationCatalog, async () =>
    localizeCatalog(listModuleCatalog(), getLanguage().locale),
  );
  ipcMain.handle(IPC_CHANNELS.previewModule, async (_e, category: ModuleCategory, id: string) =>
    previewModule(category, id),
  );

  // Drive the native appearance so a forced light/dark theme also flips the macOS
  // vibrancy material (otherwise dark text lands on a dark vibrancy backdrop) and
  // the renderer's prefers-color-scheme.
  ipcMain.handle(IPC_CHANNELS.themeSet, async (_e, pref: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = pref;
  });

  ipcMain.handle(IPC_CHANNELS.languageGet, async () => getLanguage());
  ipcMain.handle(IPC_CHANNELS.languageSet, async (_e, pref: LanguagePref) => {
    const info = setLanguage(pref);
    buildAppMenu(); // the native menu is built in the new locale
    return info;
  });

  ipcMain.handle(IPC_CHANNELS.chatHistoryGet, async (_e, key: string) => getChat(key));
  ipcMain.handle(IPC_CHANNELS.chatHistorySave, async (_e, key: string, record: ChatRecord) =>
    saveChat(key, record),
  );

  ipcMain.handle(IPC_CHANNELS.setFileOpen, async (_e, open: boolean) => setFileOpen(open));

  ipcMain.handle(IPC_CHANNELS.exportFile, async (_e, srcPath: string, suggestedName: string) =>
    exportStructure(srcPath, suggestedName),
  );

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
