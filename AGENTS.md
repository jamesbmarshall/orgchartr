# Project Guidelines

## Repository Layout

- This is an npm workspace with `frontend/` (Vite, React, TypeScript) and `server/` (Express, TypeScript).
- User data is stored in a host directory selected through `ORGCHARTR_DATA_DIR` and bind-mounted at `/app/data`. The default `./data` directory remains ignored by the app repository.
- Use [README.md](README.md) for setup and storage-directory instructions instead of duplicating them here.

## Architecture

- Keep browser-side HTTP calls in `frontend/src/api/client.ts` and async application state in the Zustand stores under `frontend/src/store/`.
- Keep Express endpoints under `server/src/routes/`. Resolve and persist JSON through `server/src/lib/dataStore.ts`; preserve its atomic write pattern for mutations.
- Frontend and server types are intentionally separate. When an API or persisted-data shape changes, update both `frontend/src/types.ts` and `server/src/types.ts`.
- The app does not manage backups or source control for user data. Keep persistence operations scoped to `DATA_DIR`.
- Docker must bind-mount only the selected host data directory at `/app/data`. Mounting the repository root hides the image's built frontend, server, and dependencies.

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
- The frontend dev server proxies `/api` and `/photos` to the server. Production serves the built frontend and API from Express.
- For dependency changes, run `npm audit` as well as the relevant lint/build checks.
