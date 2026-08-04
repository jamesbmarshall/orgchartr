# orgchartr

A self-hosted org chart visualizer for tracking partner stakeholders and their Microsoft sponsors.

- One org chart per partner (or team) - add, edit, and remove people, and draw the reporting lines between them.
- A shared, reusable directory of Microsoft employees ("sponsors") that you can link to any person on any chart.
- Runs locally in Docker - no cloud hosting, no accounts. Your data lives as JSON files in a private, independent git repo (`data/`), so history is just `git log` - completely separate from the app code repo, so partner/sponsor data never has to be pushed to wherever you host this codebase.

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or another Docker Engine + Compose setup)
- Git

## Running it

```powershell
docker compose up --build
```

Then open **http://localhost:3000**.

Stop it with `Ctrl+C`, or `docker compose down` to remove the container (your data stays on disk either way).

### Git commit identity (optional)

The app has a "Commit changes" button that runs `git commit` for you. Set your identity via environment variables before starting, otherwise it defaults to `orgchartr <orgchartr@localhost>`:

```powershell
$env:GIT_AUTHOR_NAME = "Your Name"
$env:GIT_AUTHOR_EMAIL = "you@example.com"
docker compose up --build
```

Or put them in a `.env` file next to `docker-compose.yml`:

```
GIT_AUTHOR_NAME=Your Name
GIT_AUTHOR_EMAIL=you@example.com
```

## How your data is stored

Everything lives under [`/data`](data) at the repo root and is bind-mounted into the container, so every edit you make in the app writes straight to these files on your machine:

- `data/charts/index.json` - the list of charts shown on the dashboard
- `data/charts/{chartId}.json` - one file per org chart (people, reporting lines, tags, sponsor links)
- `data/sponsors.json` - the shared Microsoft sponsor directory
- `data/assets/photos/` - uploaded photos

**`data/` is its own independent git repository (`data/.git`), separate from the app code repo.** The root `.gitignore` excludes `data/` entirely, so cloning/pushing the app code never touches your org chart data. This means:

- You can push this app's code to a public or shared remote (GitHub, etc.) without your partner/sponsor data going anywhere near it.
- The data repo can have no remote at all (purely local history), or its own private remote (a private GitHub repo, a network share, etc.) - configure it independently:
  ```powershell
  cd data
  git remote add origin <your-private-data-repo-url>
  ```
- The in-app **Commit changes** / **Push…** buttons operate on the `data/` repo, not the app code repo.

Because it's just files in your working copy, you decide when to snapshot changes:

1. Edit people/charts/sponsors in the app - each edit saves immediately (no export/import step).
2. Click **Commit changes** in the toolbar when you want to checkpoint your edits into `data/`'s git history.
3. Click **Push…** (with confirmation) if/when you want to send those commits to the data repo's remote (if one is configured).

You can also skip the buttons entirely and run `git add`, `git commit`, `git push` yourself from a terminal inside `data/` - the app doesn't require you to use them.

### Setting up a fresh clone

Since `data/` isn't part of the app code repo, a fresh clone of the app won't have any data. Either:

- Start empty: just run the app - it seeds `data/charts/index.json` and `data/sponsors.json` with empty arrays on first run.
- Restore your existing data: clone/copy your separate data repo into `data/` before running `docker compose up`.

## Local development (without Docker)

Requires Node.js 20+.

```powershell
npm install
npm run dev
```

This runs the Express API on port 3001 and the Vite dev server (with hot reload) on port 5173, proxying `/api` and `/photos` requests to the API. Open **http://localhost:5173**.

## Project structure

```
frontend/   React + TypeScript + React Flow canvas UI
server/     Express + TypeScript API, reads/writes /data, git integration
data/       JSON data + photos - its OWN independent git repo, gitignored by the app repo
docker/     Container entrypoint script
```

## Notes

- Deleting a person reparents their direct reports to that person's own manager (or makes them roots) rather than orphaning them.
- The manager dropdown prevents selecting yourself or one of your own descendants (no cycles).
- "Push" is always a separate, explicitly-confirmed action from "Commit" - it never happens automatically.
