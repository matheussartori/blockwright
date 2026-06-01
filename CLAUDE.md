# Blockwright

Electron desktop app that renders Minecraft `.nbt` structure files in 3D. Long-term
goal: also AI-generate structures. Built with Electron Forge + Vite + TypeScript +
Three.js. Block models/textures come from an extracted Minecraft "content pack" on disk.

## Commands

- `npm start` — run the app in dev (Vite dev server + Electron, with HMR).
- `npm run lint` — ESLint (typescript-eslint). There is no separate typecheck script.
- `npm run package` / `npm run make` — build/package via Electron Forge.

## Architecture

Three Vite bundles, one per Electron context. Keep the process boundary strict:
**no Node/`fs`/`electron` imports in the renderer** — everything crosses via IPC.

```
src/
  main.ts                 Main entry: app lifecycle, open-file, scheme/protocol/IPC wiring
  preload.ts              Exposes window.blockwright (contextBridge) — the only renderer→main bridge
  main/
    window.ts             BrowserWindow creation, open dialog, pending-open queue, BW_CAPTURE
    ipc.ts                ipcMain.handle registrations for IPC_CHANNELS
    app-menu.ts           Native application menu (OS menu bar): File ▸ Open / Open Recent / Clear
    recents.ts            Persisted "recently opened" list (last 10) in userData
    texture-protocol.ts   Custom bw-texture:// privileged scheme serving content-pack PNGs
    structure/
      load-structure.ts   Parse .nbt (prismarine-nbt) → StructureData
      content-pack.ts      Locate content pack on disk + cached JSON loader
      blockstate-resolver.ts / model-loader.ts  block name+props → resolved models
      fallback-color.ts    Deterministic per-block color when textures are missing
  renderer/
    index.ts              Renderer entry: mountShell → Viewer → App
    app.ts                Orchestration: open/load flow, wiring
    ui/shell.ts           Static chrome (titlebar/stage/statusbar) → typed element refs
    ui/inspector.ts, statusbar.ts, html.ts
    viewer/               Three.js viewer + mesh/geometry/texture building
  shared/
    ipc.ts                Single source of truth for IPC channel/event names
    types.ts              Type-only contracts shared by both bundles (incl. BlockwrightApi)
content/                  Extracted Minecraft content pack (assets/minecraft/...). Shipped as extraResource.
```

### IPC pattern

`shared/ipc.ts` holds all channel/event name constants — never inline channel strings.
`IPC_CHANNELS` = request/response (`ipcRenderer.invoke` ↔ `ipcMain.handle`);
`IPC_EVENTS` = fire-and-forget pushes from main → renderer (e.g. `open-path`).
When adding a feature that crosses the boundary: add the channel in `shared/ipc.ts`,
the handler in `main/ipc.ts`, the method on `BlockwrightApi` in `shared/types.ts`, and
the binding in `preload.ts`.

### Content pack

`content-pack.ts` locates the pack via `BW_CONTENT` env override → packaged `resourcesPath/content`
→ repo `content/`. Textures are served to the renderer only through the `bw-texture://` scheme,
never `file://`. When the pack is missing, blocks fall back to flat deterministic colors
(`fallback-color.ts`) and `StructureData.hasContent` is false.

## Conventions / gotchas

- **Path alias:** `@/*` → `src/*` (see `tsconfig.json`). Use it for cross-dir imports.
- **Texture protocol CORS:** the `bw-texture://` scheme must be registered as privileged
  with `corsEnabled: true` *and* the handler must return an `access-control-allow-origin`
  header, or Three.js texture loads fail. Scheme registration happens at module load,
  before `app.ready`; the handler is wired after.
- **Forge entry naming:** keep `src/main.ts` and `src/preload.ts` at the top level —
  Forge names the output bundles by entry basename, and `main` in package.json points at
  `.vite/build/main.js`.
- **Renderer HTML safety:** UI is built by string templating into `innerHTML`; always run
  user/file-derived strings through `escapeHtml` (`renderer/ui/html.ts`).
- **Recents are owned by main:** `recents.ts` is the single source of truth. The native
  File menu and the renderer both mutate it via IPC; every mutation rebuilds the menu and
  broadcasts `recentsChanged`, which the welcome view re-renders from (don't keep a separate
  authoritative copy in the renderer).
- **macOS chrome:** the window uses `hiddenInset` titlebar + vibrancy; the titlebar is a
  custom drag region (`-webkit-app-region: drag`). Interactive elements inside it need
  `-webkit-app-region: no-drag`.

## Visual testing (no screen-recording permission needed)

The app can screenshot itself headlessly. Set env vars when launching:
- `BW_OPEN=/path/to/file.nbt` — open a file on startup.
- `BW_CAPTURE=/path/out.png` — render, write a PNG, then quit (~2.5s delay).
- `BW_CONTENT=/path/to/content` — override the content-pack location.
