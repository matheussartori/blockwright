// Builds the native application menu (the OS menu bar). The File menu carries
// Open / Open Recent / Clear Recently Opened; the rest are standard roles so
// the usual shortcuts (copy, quit, devtools, …) keep working.
import { Menu, type MenuItemConstructorOptions } from 'electron';
import path from 'node:path';
import { clearRecents, getRecents } from './recents';
import { notifyRecents, openFile, openFileDialog } from './window';

const isMac = process.platform === 'darwin';

export function buildAppMenu(): void {
  const recents = getRecents();
  const openRecent: MenuItemConstructorOptions[] = recents.length
    ? [
        ...recents.map((p) => ({ label: path.basename(p), toolTip: p, click: () => openFile(p) })),
        { type: 'separator' as const },
        { label: 'Clear Recently Opened', click: () => { clearRecents(); refreshMenu(); } },
      ]
    : [{ label: 'No Recent Files', enabled: false }];

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open NBT…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const p = await openFileDialog();
            if (p) openFile(p);
          },
        },
        { label: 'Open Recent', submenu: openRecent },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** Rebuild the menu and push the updated list to the renderer's welcome view. */
export function refreshMenu(): void {
  buildAppMenu();
  notifyRecents();
}
