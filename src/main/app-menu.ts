// Builds the native application menu (the OS menu bar). The File menu carries
// Open / Open Recent / Clear Recently Opened; the rest are standard roles so
// the usual shortcuts (copy, quit, devtools, …) keep working.
import { Menu, app, dialog, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import type { WindowId, WindowsReport } from '@/shared/types';
import { clearRecents, getRecents } from './recents';
import { clearRecentWorkspaces, getRecentWorkspaces } from './recent-workspaces';
import { getActiveWorkspace } from './structure/content-pack';
import { activateWorkspace, applyWorkspace, promptOpenWorkspace } from './workspace';
import {
  notifyClose,
  notifyOpenSettings,
  notifyNewStructure,
  notifyRecents,
  notifyRecentWorkspaces,
  notifyResetWindows,
  notifyWindowToggle,
  openFile,
  openFileDialog,
} from './window';

const isMac = process.platform === 'darwin';

// Whether the renderer currently has a structure open (mirrored from the
// renderer over IPC) — drives the enabled state of the Close File menu item.
let fileOpen = false;

// Floating-window state mirrored from the renderer (it owns the persisted
// layout). Drives the View menu's per-window checkmarks/enabled state. Defaults
// to "shown but unavailable" until the renderer reports and a file is open.
let windowsState: WindowsReport = {
  controls: { visible: true, available: false },
  inspector: { visible: true, available: false },
  jigsaw: { visible: true, available: false },
  generate: { visible: false, available: true },
};

/** Update the open-file flag and rebuild the menu if it changed. */
export function setFileOpen(open: boolean): void {
  if (open === fileOpen) return;
  fileOpen = open;
  buildAppMenu();
}

/** Mirror the renderer's floating-window state and rebuild the View menu. */
export function setWindowsState(state: WindowsReport): void {
  windowsState = state;
  buildAppMenu();
}

async function openWorkspaceFromMenu(): Promise<void> {
  const { error } = await promptOpenWorkspace();
  if (error) dialog.showErrorBox('Open mod workspace', error);
  buildAppMenu(); // reflect the active workspace (Close item, etc.)
}

export function buildAppMenu(): void {
  const recents = getRecents();
  const openRecent: MenuItemConstructorOptions[] = recents.length
    ? [
        ...recents.map((p) => ({ label: path.basename(p), toolTip: p, click: () => openFile(p) })),
        { type: 'separator' as const },
        { label: 'Clear Recently Opened', click: () => { clearRecents(); refreshMenu(); } },
      ]
    : [{ label: 'No Recent Files', enabled: false }];

  const recentWorkspaces = getRecentWorkspaces();
  const openRecentWorkspace: MenuItemConstructorOptions[] = recentWorkspaces.length
    ? [
        ...recentWorkspaces.map((ws) => ({
          label: ws.name,
          toolTip: `${ws.namespace} · ${ws.root}`,
          click: () => { activateWorkspace(ws); buildAppMenu(); },
        })),
        { type: 'separator' as const },
        {
          label: 'Clear Recent Workspaces',
          click: () => { clearRecentWorkspaces(); notifyRecentWorkspaces(); buildAppMenu(); },
        },
      ]
    : [{ label: 'No Recent Workspaces', enabled: false }];

  // The Settings item lives where each OS expects it: under the app menu on
  // macOS (Cmd+,), and under File on Windows/Linux (Ctrl+,). Both route to the
  // same renderer-side panel via IPC.
  const settingsItem: MenuItemConstructorOptions = {
    label: 'Settings…',
    accelerator: 'CmdOrCtrl+,',
    click: () => notifyOpenSettings(),
  };

  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      settingsItem,
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  };

  // Custom View menu: per-window show/hide toggles, the zoom roles, one
  // full-screen toggle, and a Layout ▸ Reset. No Reload/DevTools.
  const windowItem = (id: WindowId, label: string, accelerator: string): MenuItemConstructorOptions => ({
    label,
    accelerator,
    type: 'checkbox',
    checked: windowsState[id].visible,
    enabled: windowsState[id].available,
    click: () => notifyWindowToggle(id),
  });

  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      windowItem('generate', 'Generate', 'CmdOrCtrl+G'),
      { type: 'separator' },
      windowItem('inspector', 'Inspector', 'CmdOrCtrl+1'),
      windowItem('jigsaw', 'Jigsaw', 'CmdOrCtrl+2'),
      { type: 'separator' },
      windowItem('controls', 'Keyboard Shortcuts', 'CmdOrCtrl+/'),
      { type: 'separator' },
      { role: 'resetZoom', label: 'Actual Size' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      {
        label: 'Layout',
        submenu: [{ label: 'Reset Layout', click: () => notifyResetWindows() }],
      },
    ],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Structure…',
          accelerator: 'CmdOrCtrl+N',
          click: () => notifyNewStructure(),
        },
        { type: 'separator' },
        {
          label: 'Open File',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const p = await openFileDialog();
            if (p) openFile(p);
          },
        },
        { label: 'Open Recent', submenu: openRecent },
        { label: 'Close File', enabled: fileOpen, click: () => notifyClose() },
        { type: 'separator' },
        {
          label: 'Open Mod Workspace…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: openWorkspaceFromMenu,
        },
        { label: 'Open Recent Workspace', submenu: openRecentWorkspace },
        {
          label: 'Close Workspace',
          enabled: getActiveWorkspace() !== null,
          click: () => {
            applyWorkspace(null);
            buildAppMenu();
          },
        },
        { type: 'separator' },
        ...(isMac ? [] : [settingsItem, { type: 'separator' as const }]),
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    viewMenu,
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Rebuild the menu and push the updated list to the renderer's welcome view. */
export function refreshMenu(): void {
  buildAppMenu();
  notifyRecents();
}
