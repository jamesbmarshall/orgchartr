# orgchartr — frontend

The React + TypeScript + Vite single-page app (the React Flow canvas UI) for orgchartr. It talks to the Express API in [`../server`](../server) and has no standalone purpose.

- **Running or setting up orgchartr:** see the [root README](../README.md).
- **Architecture and conventions** (where API calls, stores, and types live): see [`../AGENTS.md`](../AGENTS.md).

## Workspace scripts

Run these from the repository root so the npm workspace resolves:

- `npm run dev` — start the frontend and API together (frontend on http://localhost:5173, proxying `/api` and `/photos` to the API on 3001).
- `npm run dev:frontend` — start only the Vite dev server.
- `npm run build` — type-check and build both workspaces.
- `npm run lint -w frontend` — lint the frontend with oxlint.
