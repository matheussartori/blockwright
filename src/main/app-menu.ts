// Builds the native application menu (the OS menu bar). The File menu carries
// Open / Open Recent / Clear Recently Opened; the rest are standard roles so
// the usual shortcuts (copy, quit, devtools, …) keep working.
import { Menu, app, dialog, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import type { WindowId, WindowsReport } from '@/shared/types';
import { LOCALE_LABELS, SUPPORTED_LOCALES, type LanguagePref } from '@/shared/i18n';
import { getLanguage, mt, setLanguage } from './language';
import { notifyLanguageChanged } from './window';
import { checkForUpdatesManually } from './update-check';
import { clearRecents, getRecents } from './recents';
import { clearRecentWorkspaces, getRecentWorkspaces } from './recent-workspaces';
import { clearRecentWorlds, getRecentWorlds } from './recent-worlds';
import { getActiveWorkspace } from './structure/assets/content-pack';
import { activateWorkspace, closeWorkspace, pinActiveWorkspace, promptOpenWorkspace } from './workspace';
import { getPinnedWorkspace } from './pinned-workspace';
import {
  notifyClose,
  notifyExportFile,
  notifyExportToWorld,
  notifyExportToWorkspace,
  notifyCompareFile,
  notifyOpenAssembly,
  notifyOpenDoctor,
  notifyReimportWorld,
  notifyRenderImage,
  notifyRetheme,
  notifyRenameProject,
  notifyOpenCatalog,
  notifyOpenGuide,
  notifyOpenModules,
  notifyOpenSettings,
  notifyNewStructure,
  notifyRecents,
  notifyRecentWorkspaces,
  notifyRecentWorlds,
  notifyResetWindows,
  notifyWindowToggle,
  openFile,
  openFileDialog,
  openWorld,
  openWorldDialog,
} from './window';

const isMac = process.platform === 'darwin';

// Whether the renderer currently has a structure open (mirrored from the
// renderer over IPC) — drives the enabled state of the Close File menu item.
let fileOpen = false;

// Whether that structure exceeds the configured Structure Block size limit
// (mirrored alongside fileOpen) — drives Export as Jigsaw's enabled state
// (a within-limit build has nothing to split; Export as NBT covers it).
let fileOversized = false;

// Whether the active doc is a renamable generated project (its own library folder).
// Mirrored from the renderer; drives the File ▸ Rename Project… enabled state.
let projectOpen = false;

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
  project: { visible: true, available: true },
};

/** Update the open-file + oversized flags and rebuild the menu if either changed. */
export function setFileOpen(open: boolean, oversized = false): void {
  if (open === fileOpen && oversized === fileOversized) return;
  fileOpen = open;
  fileOversized = oversized;
  buildAppMenu();
}

/** Update the renamable-project flag and rebuild the menu if it changed. */
export function setProjectOpen(open: boolean): void {
  if (open === projectOpen) return;
  projectOpen = open;
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

/** Pick a world folder (main-side dialog) and hand it to the renderer, which opens it as a tab. */
async function openWorldFromMenu(): Promise<void> {
  const dir = await openWorldDialog();
  if (dir) openWorld(dir);
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

/** Shared shape of the three "Open Recent …" submenus: one item per recent
 *  entry, a separator, then the Clear action — or a single disabled "none"
 *  label when the list is empty. */
function recentSubmenu<T>(opts: {
  items: T[];
  item: (entry: T) => MenuItemConstructorOptions;
  clearLabel: string;
  onClear: () => void;
  emptyLabel: string;
}): MenuItemConstructorOptions[] {
  return opts.items.length
    ? [
        ...opts.items.map(opts.item),
        { type: 'separator' as const },
        { label: opts.clearLabel, click: opts.onClear },
      ]
    : [{ label: opts.emptyLabel, enabled: false }];
}

/** File ▸ Open Recent — the recently opened structure files. */
function openRecentSubmenu(): MenuItemConstructorOptions[] {
  return recentSubmenu({
    items: getRecents(),
    item: (p) => ({ label: path.basename(p), toolTip: p, click: () => openFile(p) }),
    clearLabel: mt('menu.clearRecent'),
    onClear: () => { clearRecents(); refreshMenu(); },
    emptyLabel: mt('menu.noRecentFiles'),
  });
}

/** File ▸ Open Recent Workspace — the recently opened mod workspaces. */
function openRecentWorkspaceSubmenu(): MenuItemConstructorOptions[] {
  return recentSubmenu({
    items: getRecentWorkspaces(),
    item: (ws) => ({
      label: ws.name,
      toolTip: `${ws.namespace} · ${ws.root}`,
      click: () => { activateWorkspace(ws); buildAppMenu(); },
    }),
    clearLabel: mt('menu.clearRecentWorkspaces'),
    onClear: () => { clearRecentWorkspaces(); notifyRecentWorkspaces(); buildAppMenu(); },
    emptyLabel: mt('menu.noRecentWorkspaces'),
  });
}

/** File ▸ Open Recent World — the recently opened Minecraft saves. */
function openRecentWorldSubmenu(): MenuItemConstructorOptions[] {
  return recentSubmenu({
    items: getRecentWorlds(),
    item: (w) => ({ label: w.name, toolTip: w.root, click: () => openWorld(w.root) }),
    clearLabel: mt('menu.clearRecentWorlds'),
    onClear: () => { clearRecentWorlds(); notifyRecentWorlds(); buildAppMenu(); },
    emptyLabel: mt('menu.noRecentWorlds'),
  });
}

// The Settings item lives where each OS expects it: under the app menu on
// macOS (Cmd+,), and under File on Windows/Linux (Ctrl+,). Both route to the
// same renderer-side panel via IPC.
function settingsMenuItem(): MenuItemConstructorOptions {
  return {
    label: mt('menu.settings'),
    accelerator: 'CmdOrCtrl+,',
    click: () => notifyOpenSettings(),
  };
}

function languageMenuItem(): MenuItemConstructorOptions {
  return {
    label: mt('menu.language'),
    submenu: languageSubmenu(),
  };
}

// Check for Updates… lives where each OS expects it: under the app menu on
// macOS (the Apple convention — right below About), and under Help on
// Windows/Linux. Both route to the same manual update check.
function checkUpdatesMenuItem(): MenuItemConstructorOptions {
  return {
    label: mt('menu.checkForUpdates'),
    click: () => void checkForUpdatesManually(),
  };
}

/** The macOS app menu (About / updates / settings / services / hide / quit). */
function appMenu(): MenuItemConstructorOptions {
  return {
    label: app.name,
    submenu: [
      // Route the native About to the in-app About (Settings ▸ About) so there's
      // one place for version/credits, not the default Electron panel.
      { label: mt('menu.about', { app: app.name }), click: () => notifyOpenSettings('about') },
      checkUpdatesMenuItem(),
      { type: 'separator' },
      settingsMenuItem(),
      languageMenuItem(),
      { type: 'separator' },
      { role: 'services', label: mt('menu.services') },
      { type: 'separator' },
      { role: 'hide', label: mt('menu.hide', { app: app.name }) },
      { role: 'hideOthers', label: mt('menu.hideOthers') },
      { role: 'unhide', label: mt('menu.unhide') },
      { type: 'separator' },
      { role: 'quit', label: mt('menu.quit', { app: app.name }) },
    ],
  };
}

/** One per-window show/hide checkbox for the View menu, driven by the
 *  renderer-mirrored `windowsState`. */
function windowItem(id: WindowId, label: string, accelerator: string): MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    type: 'checkbox',
    checked: windowsState[id].visible,
    enabled: windowsState[id].available,
    click: () => notifyWindowToggle(id),
  };
}

/** Custom View menu: per-window show/hide toggles, the zoom roles, one
 *  full-screen toggle, and a Layout ▸ Reset. No Reload/DevTools. */
function viewMenu(): MenuItemConstructorOptions {
  return {
    label: mt('menu.view'),
    submenu: [
      windowItem('generate', mt('menu.generate'), 'CmdOrCtrl+G'),
      { type: 'separator' },
      windowItem('project', mt('menu.projectPanel'), 'CmdOrCtrl+B'),
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
      { role: 'zoomIn', label: mt('menu.zoomIn') },
      { role: 'zoomOut', label: mt('menu.zoomOut') },
      { type: 'separator' },
      { role: 'togglefullscreen', label: mt('menu.toggleFullScreen') },
      { type: 'separator' },
      {
        label: mt('menu.layout'),
        submenu: [{ label: mt('menu.resetLayout'), click: () => notifyResetWindows() }],
      },
    ],
  };
}

/** Edit menu, built explicitly (instead of `role: 'editMenu'`) so its labels
 *  follow the app's i18n preference, not the OS locale. */
function editMenu(): MenuItemConstructorOptions {
  return {
    label: mt('menu.edit'),
    submenu: [
      { role: 'undo', label: mt('menu.undo') },
      { role: 'redo', label: mt('menu.redo') },
      { type: 'separator' },
      { role: 'cut', label: mt('menu.cut') },
      { role: 'copy', label: mt('menu.copy') },
      { role: 'paste', label: mt('menu.paste') },
      ...(isMac
        ? [
            { role: 'pasteAndMatchStyle' as const, label: mt('menu.pasteAndMatchStyle') },
            { role: 'delete' as const, label: mt('menu.delete') },
            { role: 'selectAll' as const, label: mt('menu.selectAll') },
            { type: 'separator' as const },
            {
              label: mt('menu.speech'),
              submenu: [
                { role: 'startSpeaking' as const, label: mt('menu.startSpeaking') },
                { role: 'stopSpeaking' as const, label: mt('menu.stopSpeaking') },
              ],
            },
          ]
        : [
            { role: 'delete' as const, label: mt('menu.delete') },
            { type: 'separator' as const },
            { role: 'selectAll' as const, label: mt('menu.selectAll') },
          ]),
    ],
  };
}

/** Window menu, built explicitly (instead of `role: 'windowMenu'`) for i18n.
 *  We deliberately DON'T set `role: 'window'`: that marks this as the system
 *  Window menu, and macOS then injects its own window-tiling items (Fill,
 *  Center, Move & Resize, …) localized with the OS UI language — never our
 *  app's i18n preference. Dropping the role keeps the menu fully translatable. */
function windowMenu(): MenuItemConstructorOptions {
  return {
    label: mt('menu.window'),
    submenu: [
      { role: 'minimize', label: mt('menu.minimize') },
      { role: 'zoom', label: mt('menu.zoom') },
      ...(isMac
        ? [
            { type: 'separator' as const },
            { role: 'front' as const, label: mt('menu.front') },
          ]
        : [{ role: 'close' as const, label: mt('menu.close') }]),
    ],
  };
}

/** The File menu: new/open/recents, the export actions, workspace + world
 *  handling, and (on Windows/Linux) Settings/Language + Quit. */
function fileMenu(): MenuItemConstructorOptions {
  return {
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
      { label: mt('menu.openRecent'), submenu: openRecentSubmenu() },
      { label: mt('menu.openAssembly'), click: () => notifyOpenAssembly() },
      { label: mt('menu.reimportWorld'), click: () => notifyReimportWorld() },
      { type: 'separator' },
      {
        // Visual structure diff: compare the open build against another file.
        label: mt('menu.compareFile'),
        enabled: fileOpen,
        click: () => notifyCompareFile(),
      },
      {
        // Blockstate-aware palette swap over the whole build (undoable, saves a version).
        label: mt('menu.retheme'),
        enabled: fileOpen,
        click: () => notifyRetheme(),
      },
      { type: 'separator' },
      {
        label: mt('menu.renameProject'),
        enabled: projectOpen,
        click: () => notifyRenameProject(),
      },
      {
        // Pure single-file export — ALWAYS available with a file open, whatever
        // the size (mods load arbitrary .nbt sizes; only Structure Blocks cap).
        label: mt('menu.exportNbt'),
        accelerator: 'CmdOrCtrl+Shift+S',
        enabled: fileOpen,
        click: () => notifyExportFile('nbt'),
      },
      {
        // Jigsaw-assembly export — only meaningful past the size limit, so it
        // stays disabled for a build that fits one Structure Block.
        label: mt('menu.exportJigsaw'),
        enabled: fileOpen && fileOversized,
        click: () => notifyExportFile('jigsaw'),
      },
      {
        label: mt('menu.exportToWorld'),
        enabled: fileOpen,
        click: () => notifyExportToWorld(),
      },
      {
        label: mt('menu.exportToWorkspace'),
        enabled: fileOpen,
        click: () => notifyExportToWorkspace(),
      },
      {
        // Beauty Render: a high-res showcase PNG / turntable WebM of the open build.
        label: mt('menu.renderImage'),
        enabled: fileOpen,
        click: () => notifyRenderImage(),
      },
      { label: mt('menu.closeFile'), enabled: fileOpen, click: () => notifyClose() },
      { type: 'separator' },
      {
        label: mt('menu.openWorkspace'),
        accelerator: 'CmdOrCtrl+Shift+O',
        click: openWorkspaceFromMenu,
      },
      { label: mt('menu.openRecentWorkspace'), submenu: openRecentWorkspaceSubmenu() },
      {
        // Pin the active workspace so it auto-activates at every launch (mirrors
        // the statusbar pin; unpinned by unchecking, pinning another, or closing).
        label: mt('menu.pinWorkspace'),
        type: 'checkbox',
        enabled: getActiveWorkspace() !== null,
        checked:
          getActiveWorkspace() !== null &&
          getPinnedWorkspace()?.root === getActiveWorkspace()?.root,
        click: (item) => {
          pinActiveWorkspace(item.checked);
          buildAppMenu();
        },
      },
      {
        // Worldgen Doctor: scan the whole workspace's data pack for the silent-failure
        // class (wrong folder, missing spawn_overrides, empty biome tags, dead pools).
        label: mt('menu.doctor'),
        enabled: getActiveWorkspace() !== null,
        click: () => notifyOpenDoctor(),
      },
      {
        label: mt('menu.closeWorkspace'),
        enabled: getActiveWorkspace() !== null,
        click: () => {
          closeWorkspace();
          buildAppMenu();
        },
      },
      { type: 'separator' },
      { label: mt('menu.openWorld'), accelerator: 'CmdOrCtrl+Shift+W', click: openWorldFromMenu },
      { label: mt('menu.openRecentWorld'), submenu: openRecentWorldSubmenu() },
      { type: 'separator' },
      ...(isMac ? [] : [settingsMenuItem(), languageMenuItem(), { type: 'separator' as const }]),
      isMac
        ? { role: 'close', label: mt('menu.close') }
        : { role: 'quit', label: mt('menu.quit', { app: app.name }) },
    ],
  };
}

/** The Help menu: the in-app Guide + (on Windows/Linux) Check for Updates. */
function helpMenu(): MenuItemConstructorOptions {
  return {
    role: 'help',
    label: mt('menu.help'),
    submenu: [
      {
        label: mt('menu.guide'),
        accelerator: 'CmdOrCtrl+Shift+/',
        click: () => notifyOpenGuide(),
      },
      // On macOS, Check for Updates lives in the app menu (above); Windows/Linux
      // keep it here in Help, the platform-conventional spot.
      ...(isMac ? [] : [{ type: 'separator' as const }, checkUpdatesMenuItem()]),
    ],
  };
}

/** Build + install the native application menu (File ▸ Open / Open Recent /
 *  Workspace, View ▸ windows, etc.). Re-called whenever the recents or the
 *  per-window visibility change, so the menu's items + checkmarks stay in sync. */
export function buildAppMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu()] : []),
    fileMenu(),
    editMenu(),
    viewMenu(),
    windowMenu(),
    helpMenu(),
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Rebuild the menu and push the updated list to the renderer's welcome view. */
export function refreshMenu(): void {
  buildAppMenu();
  notifyRecents();
}
