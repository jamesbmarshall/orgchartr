# Project Guidelines

## Repository Layout

- This is an npm workspace with `shared/` (pure TypeScript domain logic + types), `frontend/` (Vite, React, TypeScript), and `server/` (Express, TypeScript).
- Docker serves a forced local-folder frontend through nginx. User data stays in a browser-selected host folder and is never mounted into or read by the container.
- Use [README.md](README.md) for setup and storage-directory instructions instead of duplicating them here.

## Architecture

- The app has two storage modes behind one adapter interface (`frontend/src/storage/adapter.ts`): server mode (HTTP calls to Express, `frontend/src/storage/serverAdapter.ts`) and local-folder mode (File System Access API against a user-picked directory, `frontend/src/storage/localAdapter.ts`). Both use the same on-disk layout, so a data folder is interchangeable between modes.
- `frontend/src/api/client.ts` re-exports the delegating facade in `frontend/src/storage/active.ts`; components and the Zustand stores under `frontend/src/store/` must only import from `client.ts`, never an adapter directly.
- Keep Express endpoints under `server/src/routes/`. Resolve and persist JSON through `server/src/lib/dataStore.ts`; preserve its atomic write pattern for mutations.
- `shared/` is the single source of truth for persisted-data types and domain logic (validation, ID generation, cycle checks, migration, package format). `frontend/src/types.ts` and `server/src/types.ts` re-export from it; never redefine those types locally. Build it with `npm run build -w shared` after changing it — server and frontend consume its `dist/` output.
- Behavior that both modes need (field parsing, tree rules, package parsing) belongs in `shared/`, not duplicated in a route and the local adapter.
- The app does not manage backups or source control for user data. Keep persistence operations scoped to `DATA_DIR` (server) or the picked folder (local mode).
- Keep the default Docker image static and local-folder-only. Do not add data bind mounts or server persistence to the default Compose path.

## Commands

- Install all workspaces from the repository root: `npm install`.
- Run frontend and server together: `npm run dev`.
- Run one side only: `npm run dev:frontend` or `npm run dev:server`.
- Validate frontend code: `npm run lint -w frontend`.
- Build and type-check both workspaces: `npm run build`.
- There is currently no automated test suite. Do not report tests as passing; use lint and the relevant build as validation.

## Project Conventions

- Import routing APIs from `react-router`, not `react-router-dom`. The direct dependency avoids the known vulnerable version pinned by `react-router-dom`.
- Keep Multer on version 2 or later. Do not replace `tsx watch` with `ts-node-dev`; the older alternatives introduce known vulnerable dependencies.
- The frontend dev server proxies `/api` and `/photos` to the server. Docker production serves the forced local-folder frontend from nginx; Express remains available for development and compatibility work but is not part of the default image.
- For dependency changes, run `npm audit` as well as the relevant lint/build checks.
