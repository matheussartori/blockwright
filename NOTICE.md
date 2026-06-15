# Third-Party Notices

Blockwright is licensed under the [MIT License](./LICENSE). It bundles and builds on the
third-party software below, each under its own license.

## Bundled fonts

- **Bricolage Grotesque** (`@fontsource-variable/bricolage-grotesque`) — © The Bricolage Grotesque
  Project Authors. Licensed under the [SIL Open Font License 1.1](https://openfontlicense.org).
  The font files are shipped with the app.

## Key runtime dependencies

| Project | License |
| --- | --- |
| [Electron](https://www.electronjs.org) | MIT |
| [React](https://react.dev) / React DOM | MIT |
| [Three.js](https://threejs.org) | MIT |
| [Zustand](https://github.com/pmndrs/zustand) | MIT |
| [lucide-react](https://lucide.dev) | ISC |
| [prismarine-nbt](https://github.com/PrismarineJS/prismarine-nbt) | MIT |
| [zod](https://zod.dev) | MIT |
| [dotenv](https://github.com/motdotla/dotenv) | BSD-2-Clause |
| [@anthropic-ai/claude-agent-sdk](https://github.com/anthropics/claude-agent-sdk-typescript) | MIT |
| [@openai/codex-sdk](https://github.com/openai/codex) | Apache-2.0 |
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | MIT |
| [update-electron-app](https://github.com/electron/update-electron-app) | MIT |

The full text of each dependency's license is available in its package under `node_modules/`, and a
complete list of dependencies is in [`package-lock.json`](./package-lock.json).

## Minecraft assets and trademarks

Blockwright is an unofficial tool and is **not affiliated with, endorsed by, or associated with
Mojang Studios or Microsoft**. *Minecraft* is a trademark of Mojang Studios.

Blockwright does **not** distribute any Minecraft game assets. To render real block textures and
models, the user supplies their own content pack extracted from their own copy of the game (see the
[README](./README.md#content-pack)). Those assets remain subject to the
[Minecraft EULA](https://www.minecraft.net/eula) and Mojang's brand and asset guidelines.
