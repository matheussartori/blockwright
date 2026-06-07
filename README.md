<p align="center">
  <img src=".github/assets/logo.png" alt="Blockwright" width="800" />
</p>

<h1 align="center">Blockwright</h1>

<p align="center">
  A desktop app for viewing, browsing, and AI-generating Minecraft <code>.nbt</code> structures in 3D.
</p>

<p align="center">
  <a href="https://www.electronjs.org"><img src="https://img.shields.io/badge/Electron-42-47848F?logo=electron&logoColor=white" alt="Electron" /></a>
  <a href="https://threejs.org"><img src="https://img.shields.io/badge/three.js-0.184-000000?logo=three.js&logoColor=white" alt="Three.js" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-6-blue?logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License" /></a>
  <a href="https://buymeacoffee.com/mattsartori"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee" /></a>
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#features">Features</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#mod-workspaces">Mod Workspaces</a> ·
  <a href="#development">Development</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#support">Support</a>
</p>

## Overview

Blockwright is an Electron desktop app that loads Minecraft `.nbt` structure files and renders
them as interactive 3D scenes. Block models and textures are read from an extracted Minecraft
"content pack" on disk, so structures appear with their real in-game look — including support for
modded blocks via [mod workspaces](#mod-workspaces).

Blockwright can also **AI-generate** structures: describe a build in a prompt (optionally with a
reference image) and the model emits a structure, which the app compiles to `.nbt`, renders, and
refines through an emit → render → review loop — previewed live in the viewer as it evolves.

## Features

- Real-time 3D rendering of `.nbt` structures with [Three.js](https://threejs.org)
- AI structure generation from a prompt or reference image, through an emit → render → review loop
  that refines the build live — with multiple provider backends to choose from (Claude
  subscription / API, OpenAI, Gemini, Codex), configured in Settings
- Composable generation domain — pick a structure type, decoration, roof, basement and per-floor
  interior rooms (living room, kitchen, library, bedroom, shared bedrooms, storage) in the Details
  composer (browse them with live 3D previews in the Module Gallery); the selection guides the build
  and loads only the relevant knowledge, and registered structure × decoration modules also cross at
  compile time behind the `template` op. Each room scales its furnishing to the floor via space-tiered
  **furnishing presets** (snug / standard / grand) that the chosen decoration re-skins — so a big room
  is furnished to its size instead of coming out empty (browse a room's presets in the Module Gallery)
- Floor-plan editing — define named vertical levels, highlighted as bands in the viewer, that ride
  along as context on every generation prompt
- A browsable structure library — each generated build is saved to its own folder (the latest clean
  `.nbt`, every kept version, and a generation log), with Open / Reveal actions on the chat's build card
- Namespace-aware asset resolution from an extracted Minecraft content pack
- Mod workspace support — render modded structures with their own textures and models, with the
  workspace's target Minecraft version auto-detected
- Jigsaw assembly preview for worldgen template pools
- Block Catalog browser with live 3D block previews
- Block-entity rendering (chests, beds, banners, skulls, decorated pots) and animated fluids
  (water / lava)
- Deterministic color fallback for blocks with missing textures
- Floating, dockable tool windows (Controls / Inspector / Jigsaw) and a light/dark themed UI
- Recently opened files and workspaces, surfaced in the welcome screen and native menu
- Headless self-screenshot for visual testing (no screen-recording permission needed)
- Full TypeScript source across all three Electron contexts

## Usage

> Blockwright is currently distributed from source. Packaged installers can be built with
> Electron Forge — see [Development](#development).

### Opening a structure

1. Launch the app (see [Development](#development) below).
2. Use **File ▸ Open…** (or the welcome screen) and pick a `.nbt` structure file.
3. The structure renders in 3D — orbit, zoom and inspect it in the viewer.

Recently opened files are remembered and listed under **File ▸ Open Recent** and on the welcome
screen.

### Generating a structure

**File ▸ New Structure** opens a chat where you describe a build (optionally attaching a reference
image). Blockwright generates the structure, compiles it to `.nbt`, and renders it in the viewer,
iterating through a visual review loop. The optional **⚙ Details** composer lets you pick a structure
type, decoration, roof and basement to steer the build — and, for a multi-storey house, assign up to
two interior rooms to each floor (e.g. _Floor 1: living room + kitchen, Floor 2: bedrooms + library_).
Your picks are shown back as a tidy build card in the chat. Browse every module with live 3D previews
in the **Module Gallery**, and use **▦ Floors** to sketch the vertical levels. Pick an AI provider and
model in **Settings ▸ AI** first.

Every finished build is saved to a browsable library — one folder per build, holding the latest clean
`.nbt`, every kept version, and a `generation.log` of how it was made. The chat's build card has
**Open** (load it in the viewer) and **Reveal** (show the folder in your file manager) actions; the
library root is configurable in **Settings ▸ AI**.

## Mod Workspaces

Modded structures reference blocks and textures that don't exist in the vanilla content pack.
A **mod workspace** points Blockwright at a mod project folder so those assets resolve correctly.

- **File ▸ Open Mod Workspace…** (or the welcome button) picks a mod project folder.
- Blockwright locates its resources root and the mod's namespace under `assets/`, then registers
  it as an extra asset source. A badge in the bottom-left shows the active workspace.
- The mod's structures (`data/<namespace>/structure/*.nbt`) are listed on the welcome screen and
  render with their custom textures.
- Opening a loose `.nbt` that lives inside a mod prompts you to activate that mod's workspace.

Opened workspaces are remembered under **File ▸ Open Recent Workspace**.

## Development

> This section is for contributors who want to run or modify Blockwright from source.

**1. Clone the repository**

```bash
git clone https://github.com/matheussartori/blockwright.git
cd blockwright
```

**2. Install dependencies**

```bash
npm install
```

**3. Start the app in development**

```bash
npm start
```

This launches the Vite dev server and Electron together, with hot-module reloading.

**Other useful commands**

| Command             | Description                                       |
| ------------------- | ------------------------------------------------- |
| `npm run lint`      | Run ESLint (typescript-eslint)                    |
| `npm run typecheck` | Type-check with `tsc --noEmit`                    |
| `npm run test`      | Run the Vitest unit suites                        |
| `npm run package`   | Package the app via Electron Forge                |
| `npm run make`      | Build distributable installers via Electron Forge |

### Visual testing

Blockwright can screenshot itself headlessly — useful for verifying renders without granting
screen-recording permission. Set these env vars when launching:

| Variable       | Description                                            |
| -------------- | ------------------------------------------------------ |
| `BW_OPEN`         | Path to a `.nbt` file to open on startup                  |
| `BW_CAPTURE`      | Path to write a PNG to, then quit (~2.5s after render)    |
| `BW_CAPTURE_DELAY`| Override the capture delay in ms (raise it on cold starts) |
| `BW_CONTENT`      | Override the content-pack location                        |
| `BW_WORKSPACE`    | Activate a mod workspace on startup                       |

## Architecture

Blockwright builds three Vite bundles, one per Electron context, with a strict process boundary —
**no Node / `fs` / `electron` imports in the renderer**; everything crosses via IPC.

```
src/
  main.ts        Main entry: app lifecycle, open-file, scheme/protocol/IPC wiring
  preload.ts     Exposes window.blockwright (contextBridge) — the only renderer→main bridge
  main/          Window, IPC handlers, native menu, recents, workspaces, structure loading,
                 the authoring/NBT compiler, the composable generation domain, and AI generation
  renderer/      React UI shell (Vite + React) and the imperative Three.js viewer
  shared/        IPC channel names and type-only contracts shared by both bundles
content/         Extracted Minecraft content pack, shipped as an extraResource
```

- **IPC** — `shared/ipc.ts` is the single source of truth for channel/event names; handlers live
  in `main/ipc.ts` and methods are exposed on `BlockwrightApi` (`shared/types/`).
- **Content pack** — asset resolution is namespace-aware (`namespace:path`); the vanilla pack
  serves `minecraft`, the active mod workspace serves its own namespace.
- **Textures** — served only through the privileged `bw-texture://` scheme (never `file://`).
- **Renderer state** — held in a vanilla [Zustand](https://github.com/pmndrs/zustand) store.

Built with **Electron Forge + Vite + TypeScript + React + Three.js**.

## Support

Blockwright is a solo, open-source project. If it's useful to you and you'd like to help fund
its continued development (including the AI structure generation), consider buying me a coffee —
every bit is genuinely appreciated. ☕

<p align="center">
  <a href="https://buymeacoffee.com/mattsartori">
    <img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me a Coffee" height="50" />
  </a>
</p>

## License

[MIT](./LICENSE) © [Matheus Sartori](https://github.com/matheussartori)
