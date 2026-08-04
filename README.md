# orgchartr

A self-hosted org chart visualizer for tracking partner stakeholders and their Microsoft sponsors.

- One org chart per partner (or team) - add, edit, and remove people, and draw the reporting lines between them.
- A shared, reusable directory of Microsoft employees ("sponsors") that you can link to any person on any chart.
- Runs locally in Docker - no cloud hosting, no accounts. Your data lives as JSON files in this repo, so history is just `git log`.

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

Because it's just files in your working copy, you decide when to snapshot changes:

1. Edit people/charts/sponsors in the app - each edit saves immediately (no export/import step).
2. Click **Commit changes** in the toolbar when you want to checkpoint your edits into git history.
3. Click **Push…** (with confirmation) if/when you want to send commits to your remote.

You can also skip the buttons entirely and run `git add`, `git commit`, `git push` yourself from a terminal - the app doesn't require you to use them.

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
data/       JSON data + photos (git-tracked, source of truth)
docker/     Container entrypoint script
```

## Notes

- Deleting a person reparents their direct reports to that person's own manager (or makes them roots) rather than orphaning them.
- The manager dropdown prevents selecting yourself or one of your own descendants (no cycles).
- "Push" is always a separate, explicitly-confirmed action from "Commit" - it never happens automatically.
