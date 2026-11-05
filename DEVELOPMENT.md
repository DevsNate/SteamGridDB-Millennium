# Development

## Building
```bash
pnpm install
pnpm run build
```
The package is written to `dist/steamgriddb.star`; building does not install it
or restart Steam. A plain `starlight pack -o dist` (with `dist/` already created)
also builds it with no install, which is how Millennium's plugin database builds
plugins: the small libraries are committed in `frontend/vendor/` and the compiled
upstream SCSS in `frontend/generated/`.

| Command | What it does |
|---|---|
| `pnpm dev` | Rebuilds on change |
| `pnpm check` | Runs every check in `scripts/checks/`; build first. The serve-patch check uses the installed Steam client (set `STEAM_PATH` if it isn't in the default folder) and skips without one |
| `pnpm styles` | Recompiles `src/styles/` after changing it; `pnpm check` fails while the CSS is out of date |
| `pnpm vendor` | Regenerates `frontend/vendor/` after a dependency or icon change |

Don't run `starlight lsp` here: it overwrites the `paths` in `tsconfig.json` that
map `@decky/*` and the small libraries to this repository's copies.

## Project layout
```
backend/main.lua          Lua backend: API Key, SteamGridDB requests, icons, packed
                          assets, and the patches applied to Steam's sp.js as it's served
frontend/                 The Millennium side
  index.tsx               Entry point: route, popout, functions the sp.js patches call
  artwork-page.tsx        Upstream's page, behind the API Key gate
  details-actions.tsx     Collections and the SteamGridDB link in the Details dialog
  collections/            The Collections tab: a draft of changes, its review and applying
  desktop-window/         Big Picture's look inside a desktop window
  library/                Lifecycle of upstream's library patches
  settings/               Settings store and panel, API Key setup view
  steam/                  Serve-time hook targets, Steam windows, tabs, routing
  services/               Backend calls, packed assets, icon conversion
  shims/                  @decky/api, @decky/ui and react-markdown on top of Millennium
  vendor/, generated/     Committed libraries and compiled CSS (both generated)
src/                      Upstream's code, same layout; edits marked // Millennium:
assets/                   Images packed into the .star
scripts/                  Generators, sync-upstream, and checks/
```

## Updating from upstream
This port is based on [decky-steamgriddb](https://github.com/SteamGridDB/decky-steamgriddb);
`package.json` records the upstream version and commit under `"upstream"`.
`src/` keeps upstream's layout, and every change to it is marked `// Millennium:`.
```bash
pnpm sync-upstream          # upstream's main, or: pnpm sync-upstream <branch|tag|commit>
```
This three-way applies upstream's `src/` changes, leaves conflict markers where
they meet a `// Millennium:` edit, lists what has to be ported by hand (the
Python backend goes to `backend/main.lua`, upstream's `src/index.tsx` to
`frontend/index.tsx`) and the dependency changes, then records the new base.
Nothing is committed. Finish with `pnpm build && pnpm check`.
