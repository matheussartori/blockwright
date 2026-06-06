// Builds the native application menu (the OS menu bar). The File menu carries
// Open / Open Recent / Clear Recently Opened; the rest are standard roles so
// the usual shortcuts (copy, quit, devtools, …) keep working.
import { Menu, app, dialog, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import type { WindowId, WindowsReport } from '@/shared/types';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type LanguagePref } from '@/shared/i18n';
import { getLanguage, mt, setLanguage } from './language';
import { notifyLanguageChanged } from './window';
import { clearRecents, getRecents } from './recents';
import { clearRecentWorkspaces, getRecentWorkspaces } from './recent-workspaces';
import { getActiveWorkspace } from './structure/assets/content-pack';
import { activateWorkspace, applyWorkspace, promptOpenWorkspace } from './workspace';
import {
  notifyClose,
  notifyExportFile,
  notifyOpenCatalog,
  notifyOpenModules,
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
  versions: { visible: false, available: false },
  console: { visible: false, available: true },
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
  if (error) dialog.showErrorBox(mt('dialog.openWorkspaceTitle'), error);
  buildAppMenu(); // reflect the active workspace (Close item, etc.)
}

/** Persist a language pick from the menu, tell the renderer, and rebuild the
 *  menu so it (and its checkmarks) reflect the new locale. */
function chooseLanguage(pref: LanguagePref): void {
  const info = setLanguage(pref);
  notifyLanguageChanged(info);
  buildAppMenu();
}

/** The Language submenu: System + one item per supported locale, the current
 *  preference checked. */
function languageSubmenu(): MenuItemConstructorOptions[] {
  const { pref } = getLanguage();
  return [
    {
      label: mt('menu.languageSystem'),
      type: 'radio',
      checked: pref === 'system',
      click: () => chooseLanguage('system'),
    },
    { type: 'separator' },
    ...SUPPORTED_LOCALES.map((locale) => ({
      label: LOCALE_LABELS[locale],
      type: 'radio' as const,
      checked: pref === locale,
      click: () => chooseLanguage(locale),
    })),
  ];
}

/** Build + install the native application menu (File ▸ Open / Open Recent /
 *  Workspace, View ▸ windows, etc.). Re-called whenever the recents or the
 *  per-window visibility change, so the menu's items + checkmarks stay in sync. */
export function buildAppMenu(): void {
  const recents = getRecents();
  const openRecent: MenuItemConstructorOptions[] = recents.length
    ? [
        ...recents.map((p) => ({ label: path.basename(p), toolTip: p, click: () => openFile(p) })),
        { type: 'separator' as const },
        { label: mt('menu.clearRecent'), click: () => { clearRecents(); refreshMenu(); } },
      ]
    : [{ label: mt('menu.noRecentFiles'), enabled: false }];

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
          label: mt('menu.clearRecentWorkspaces'),
          click: () => { clearRecentWorkspaces(); notifyRecentWorkspaces(); buildAppMenu(); },
        },
      ]
    : [{ label: mt('menu.noRecentWorkspaces'), enabled: false }];

  // The Settings item lives where each OS expects it: under the app menu on
  // macOS (Cmd+,), and under File on Windows/Linux (Ctrl+,). Both route to the
  // same renderer-side panel via IPC.
  const settingsItem: MenuItemConstructorOptions = {
    label: mt('menu.settings'),
    accelerator: 'CmdOrCtrl+,',
    click: () => notifyOpenSettings(),
  };

  const languageItem: MenuItemConstructorOptions = {
    label: mt('menu.language'),
    submenu: languageSubmenu(),
  };

  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      // Route the native About to the in-app About (Settings ▸ About) so there's
      // one place for version/credits, not the default Electron panel.
      { label: mt('menu.about', { app: app.name }), click: () => notifyOpenSettings('about') },
      { type: 'separator' },
      settingsItem,
      languageItem,
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
    label: mt('menu.view'),
    submenu: [
      windowItem('generate', mt('menu.generate'), 'CmdOrCtrl+G'),
      { type: 'separator' },
      windowItem('inspector', mt('menu.inspector'), 'CmdOrCtrl+1'),
      windowItem('jigsaw', mt('menu.jigsaw'), 'CmdOrCtrl+2'),
      windowItem('versions', mt('menu.versions'), 'CmdOrCtrl+3'),
      windowItem('console', mt('menu.console'), 'CmdOrCtrl+Shift+K'),
      // Browsers/galleries: modals rather than docked panels, so they get their
      // own group apart from the window toggles above.
      { type: 'separator' },
      { label: mt('menu.blockCatalog'), accelerator: 'CmdOrCtrl+Shift+B', click: () => notifyOpenCatalog() },
      { label: mt('menu.moduleGallery'), accelerator: 'CmdOrCtrl+Shift+M', click: () => notifyOpenModules() },
      { type: 'separator' },
      windowItem('controls', mt('menu.keyboardShortcuts'), 'CmdOrCtrl+/'),
      { type: 'separator' },
      { role: 'resetZoom', label: mt('menu.actualSize') },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      {
        label: mt('menu.layout'),
        submenu: [{ label: mt('menu.resetLayout'), click: () => notifyResetWindows() }],
      },
    ],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu] : []),
    {
      label: mt('menu.file'),
      submenu: [
        {
          label: mt('menu.newStructure'),
          accelerator: 'CmdOrCtrl+N',
          click: () => notifyNewStructure(),
        },
        { type: 'separator' },
        {
          label: mt('menu.openFile'),
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const p = await openFileDialog();
            if (p) openFile(p);
          },
        },
        { label: mt('menu.openRecent'), submenu: openRecent },
        {
          label: mt('menu.exportFile'),
          accelerator: 'CmdOrCtrl+Shift+S',
          enabled: fileOpen,
          click: () => notifyExportFile(),
        },
        { label: mt('menu.closeFile'), enabled: fileOpen, click: () => notifyClose() },
        { type: 'separator' },
        {
          label: mt('menu.openWorkspace'),
          accelerator: 'CmdOrCtrl+Shift+O',
          click: openWorkspaceFromMenu,
        },
        { label: mt('menu.openRecentWorkspace'), submenu: openRecentWorkspace },
        {
          label: mt('menu.closeWorkspace'),
          enabled: getActiveWorkspace() !== null,
          click: () => {
            applyWorkspace(null);
            buildAppMenu();
          },
        },
        { type: 'separator' },
        ...(isMac ? [] : [settingsItem, languageItem, { type: 'separator' as const }]),
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
