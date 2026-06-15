# Contributing to Blockwright

Thanks for your interest in improving Blockwright! This guide covers how to get set up,
the conventions the project follows, and how to land a change.

By participating, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Getting set up

**Prerequisites:** [Node.js](https://nodejs.org) 22 or newer (the repo pins **26** in
`.nvmrc` — `nvm use` picks it up).

```bash
git clone https://github.com/matheussartori/blockwright.git
cd blockwright
npm install
npm start          # Vite dev server + Electron, with HMR
```

### Content pack

Blockwright does not bundle Minecraft's assets. To render real block textures in dev, drop an
extracted content pack into a `content/` folder at the repo root (it's gitignored and picked up
automatically), or point the app at one via **Settings ▸ Viewer ▸ Content pack** / the `BW_CONTENT`
environment variable. See the [README](./README.md#content-pack) for details. Without one, blocks
render as flat colors — fine for most non-rendering work.

## Quality checks

Run these before opening a PR (CI runs them too):

| Command             | What it checks                          |
| ------------------- | --------------------------------------- |
| `npm run lint`      | ESLint (typescript-eslint)              |
| `npm run typecheck` | `tsc --noEmit`                          |
| `npm test`          | Vitest unit suites                      |
| `npm run coverage`  | Tests with a coverage report (optional) |

Git hooks (via [husky](https://typicode.github.io/husky/)) enforce a baseline automatically:

- **pre-commit** — `lint-staged` (ESLint + related tests on staged files)
- **commit-msg** — `commitlint` (see below)
- **pre-push** — `npm run typecheck` and `npm test`

## Commit conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) and are enforced by
commitlint (`@commitlint/config-conventional`). The type prefix drives the changelog, so use a
meaningful one:

```
feat: add hip-roof module
fix: stop stairwell pass from carving locked walls
docs: clarify content-pack setup
chore: bump three.js
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`.

## Architecture notes

Blockwright is an Electron app with a **strict process boundary** — no Node/`fs`/`electron` imports
in the renderer; everything crosses via IPC. Before making structural changes, skim
[`CLAUDE.md`](./CLAUDE.md) (the in-depth architecture guide) and the
[Architecture section of the README](./README.md#architecture). In particular:

- Add IPC by touching all four layers: `shared/ipc.ts`, `main/ipc.ts`, `shared/types/api.ts`,
  `preload.ts`.
- User-facing strings go in **both** `src/shared/i18n/en.ts` and `pt-BR.ts` (a coverage test fails
  otherwise).

## Opening a pull request

1. Branch off `main`.
2. Make your change with tests where it makes sense.
3. Ensure lint, typecheck and tests pass.
4. Open a PR against `main` and fill in the template. Link any related issue.

Small, focused PRs are easier to review and land faster. Thank you for contributing! 🧱
