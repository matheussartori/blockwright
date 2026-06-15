# Security Policy

## Supported versions

Blockwright is an actively developed desktop app. Security fixes target the **latest released
version**. Please make sure you're on the most recent [release](https://github.com/matheussartori/blockwright/releases)
before reporting.

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately via GitHub's [private vulnerability reporting](https://github.com/matheussartori/blockwright/security/advisories/new)
(Security ▸ Report a vulnerability), or by email to **ms.sartori@outlook.com.br**.

Please include:

- A description of the issue and its impact.
- Steps to reproduce (a proof of concept if you have one).
- The Blockwright version and your OS.

You'll get an acknowledgement as soon as possible. Once a fix is available, it ships in a new
release and the advisory is published with credit (unless you prefer to stay anonymous).

## Scope & notes

Blockwright is a local Electron app. Areas especially worth scrutiny:

- **AI credentials** — provider secrets are stored encrypted via the OS keychain
  (`safeStorage`) in `userData` and never cross the renderer bridge; only a masked hint and a
  "configured" flag do. The app can also fall back to your installed Claude/Codex CLI login.
- **Process boundary** — the renderer has no Node access; it reaches the main process only through
  the `contextBridge` in `preload.ts` (`contextIsolation` on, `nodeIntegration` off, sandboxed).
- **File/asset handling** — `.nbt` parsing, the `bw-texture://` protocol, and user-pointed content
  packs / mod workspaces.

Reports about third-party dependencies are welcome, but please also report them upstream where
appropriate.
