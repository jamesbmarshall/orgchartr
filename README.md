# orgchartr

A self-hosted org chart visualizer for tracking partner stakeholders and their Microsoft sponsors.

- One org chart per partner (or team) - add, edit, and remove people, and draw the reporting lines between them.
- A shared, reusable directory of Microsoft employees ("sponsors") that you can link to any person on any chart.
- Export the whole chart, or just chosen branches and people, as SVG, PNG, CSV, or JSON.
- Runs locally in Docker with no cloud hosting or app accounts.
- Stores JSON and photos in a host folder you choose. The app does not upload, sync, or back up that folder.

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or another Docker Engine + Compose setup)

## Running it

```powershell
docker compose up -d --build
```

Then open **http://localhost:3000**.

Stop it with `docker compose down`. Removing or rebuilding the container does not delete the selected host folder.

## How your data is stored

By default, data is stored in the ignored `data/` folder beside this README. It contains:

- `data/charts/index.json` - the list of charts shown on the dashboard
- `data/charts/{chartId}.json` - one file per org chart (people, reporting lines, tags, sponsor links)
- `data/charts/history/` - recent snapshots that can be restored from each chart
- `data/sponsors.json` - the shared Microsoft sponsor directory
- `data/assets/photos/` - uploaded photos

### Choose another folder

On Windows, run the folder picker and select an existing folder, such as one under OneDrive:

```powershell
./scripts/select-data-directory.ps1
docker compose up -d --build
```

The picker writes `ORGCHARTR_DATA_DIR` to the repository's ignored `.env` file. You can configure it manually instead; use forward slashes in Windows paths and quote paths containing spaces:

```dotenv
ORGCHARTR_DATA_DIR="C:/Users/your-name/OneDrive/orgchartr-data"
```

Docker bind-mounts only this folder at `/app/data`. The browser cannot change the path while the container is running; rerun the picker and recreate the container to switch folders.

### Move existing data

Stop the app, copy the data into the new folder, select that folder, and restart:

```powershell
docker compose down
$destination = "$HOME/OneDrive/orgchartr-data"
New-Item -ItemType Directory -Force $destination
Copy-Item ./data/charts, ./data/assets, ./data/sponsors.json -Destination $destination -Recurse
./scripts/select-data-directory.ps1
docker compose up -d --build
```

Select `$destination` in the picker. The copy command intentionally excludes any old `.git` directory.

### Backup and portability

Use **Export backup** on the dashboard to download one ZIP containing all charts, chart history, sponsors, and photos. Use **Restore from backup** to replace all data in another orgchartr installation with that portable copy. Existing backups created before the versioned backup manifest was introduced remain supported.

The selected live data directory must have one owning orgchartr container. Do not run multiple containers against the same OneDrive, Dropbox, SMB, or other shared folder. Share or move the exported ZIP instead, then restore it into the destination installation.

The in-app ZIP is a point-in-time portable copy, not an off-device backup service. OneDrive sync can provide another copy of the live directory, but sync can also propagate deletion or corruption. Keep exported backups under retention/versioning appropriate for the sensitivity of the data.

## Local development (without Docker)

Requires Node.js 20+.

```powershell
npm install
npm run dev
```

This runs the Express API on port 3001 and the Vite dev server (with hot reload) on port 5173, proxying `/api` and `/photos` requests to the API. Open **http://localhost:5173**.

Set `DATA_DIR` before `npm run dev` to use a folder other than `./data` during local development.

## Project structure

```
frontend/   React + TypeScript + React Flow canvas UI
server/     Express + TypeScript API, reads/writes DATA_DIR
data/       Default ignored data folder
scripts/    Local setup helpers
```

## Exporting a chart

Open a chart and use **Export** in the toolbar. You can export the entire chart, or tick specific
people and optionally pull in everyone reporting into them and/or their management chain.

| Format | Use it for |
| --- | --- |
| SVG | PowerPoint. Insert > Pictures > This device, and the chart stays sharp at any size (and stays editable via Graphic > Convert to Shape). |
| PNG | A flat picture for slides, docs, or chat. Rendered at 2x for crisp text. |
| CSV | Excel, or bulk review of names, titles, managers, sponsors, and tags. |
| JSON | Structured data, including tags and saved positions. |

Photos are embedded in the SVG and PNG exports, so the files stand alone once downloaded.

## Notes

- Deleting a person reparents their direct reports to that person's own manager (or makes them roots) rather than orphaning them.
- The manager dropdown prevents selecting yourself or one of your own descendants (no cycles).
