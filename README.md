# orgchartr

**Living org charts of the partner organisations you work with, cross-linked to the Microsoft sponsors who own each relationship — running on your own machine, with the data in a folder you choose.**

orgchartr is for anyone leading through partners or stakeholders who needs to *see* — at a glance — who is who in a partner's organisation, who reports to whom, and which Microsoft sponsor covers each person. It's built to take the mental load off remembering all of that, and to let a virtual team share one clear picture. Charts export cleanly into PowerPoint, so they slot straight into your notes and planning.

New here? Start with the plain-English [**Getting started guide**](docs/GETTING-STARTED.md). Wondering why this over PowerPoint, Excel, or a CRM? See [**Why orgchartr?**](docs/WHY-ORGCHARTR.md).

- One org chart per partner (or team) — add, edit, and remove people, and draw the reporting lines between them.
- Each person carries a title, department, tags, a photo, free-text **notes** (decisions they own, how they like to be contacted, anything worth remembering), and links to one or more Microsoft sponsors.
- A shared, reusable directory of Microsoft employees ("sponsors") you can link to any person on any chart.
- Export a whole chart, or chosen branches and people, as SVG, PNG, CSV, or JSON.
- Runs locally in Docker with no cloud hosting and no accounts to create.
- Stores its data in a folder you choose. The app never uploads, syncs, or backs up that folder for you.

## Quickstart

1. **Install Docker Desktop.** Get it from [docker.com](https://www.docker.com/products/docker-desktop/) and start it (wait for the whale icon to settle).
2. **Start orgchartr.** In a terminal, from this folder, run:
   ```
   docker compose up -d --build
   ```
3. **Open it** at **http://localhost:3000**.

That's the whole setup. To stop it later, run `docker compose down` (your data folder is left untouched).

> **It runs on this computer only.** orgchartr has no login, so it is deliberately reachable only from the machine it runs on — not from anyone else on your network. See [Exposing it on a network](#exposing-it-on-a-network-advanced) if you genuinely need otherwise.

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or another Docker Engine + Compose setup). Nothing else — you don't need Node.js or any developer tools to run it.

## Choosing where your data is stored

By default, data lives in an ignored `data/` folder beside this README. To keep it somewhere you control — for example a OneDrive folder so it's backed up — pick that folder once:

- **Windows (PowerShell):**
  ```powershell
  ./scripts/select-data-directory.ps1
  docker compose up -d --build
  ```
- **macOS / Linux:**
  ```bash
  ./scripts/select-data-directory.sh
  docker compose up -d --build
  ```

The picker writes your choice as `ORGCHARTR_DATA_DIR` into the repository's ignored `.env` file. You can also set it by hand — use forward slashes on Windows paths and quote paths containing spaces:

```dotenv
ORGCHARTR_DATA_DIR="C:/Users/your-name/OneDrive/orgchartr-data"
```

Docker mounts only this one folder into the app at `/app/data`. The app can't change the path while it's running; re-run the picker and restart to switch folders.

### Moving existing data to a new folder

Stop the app, copy the data across, select the new folder, and restart. For example on macOS/Linux:

```bash
docker compose down
dest="$HOME/OneDrive/orgchartr-data"
mkdir -p "$dest"
cp -R ./data/charts ./data/assets ./data/sponsors.json "$dest"/
./scripts/select-data-directory.sh   # choose "$dest"
docker compose up -d --build
```

The Windows equivalent using the PowerShell picker:

```powershell
docker compose down
$destination = "$HOME/OneDrive/orgchartr-data"
New-Item -ItemType Directory -Force $destination
Copy-Item ./data/charts, ./data/assets, ./data/sponsors.json -Destination $destination -Recurse
./scripts/select-data-directory.ps1
docker compose up -d --build
```

Only one running orgchartr container may own a given data folder. Don't point two containers at the same OneDrive/Dropbox/SMB folder — share or move an exported ZIP (below) instead.

## How your data is stored

The data folder contains:

- `charts/index.json` — the list of charts shown on the dashboard
- `charts/{chartId}.json` — one file per org chart (people, reporting lines, notes, tags, sponsor links)
- `charts/history/` — recent automatic snapshots you can restore from
- `sponsors.json` — the shared Microsoft sponsor directory
- `assets/photos/` — uploaded photos

It's plain JSON and images — nothing proprietary. You can read it, copy it, or back it up like any other folder.

## A note on the data you're storing

orgchartr holds **real names and job details of people who work at partner organisations** — that is personal data. A few sensible habits:

- Keep the data folder somewhere appropriate for work information (e.g. your corporate OneDrive), not a shared or public location.
- The app has no login and is bound to this machine only; keep it that way unless you have a specific reason not to.
- Use the exports below for backups, and keep those backups under whatever retention your organisation expects for this kind of data.

## Backups and portability

- **One chart:** open a chart, choose **Export → Portable package (ZIP)**. The ZIP contains the selected people, their sponsor links, referenced sponsors, and photos. Use **Import chart package** on the dashboard to add it elsewhere without disturbing existing data.
- **The whole installation:** use **Export backup** on the dashboard for a single ZIP of all charts, history, sponsors, and photos. **Restore from backup** replaces everything in another orgchartr installation with that copy.

The in-app ZIP is a point-in-time copy, not an off-device backup service. OneDrive sync gives you another copy of the live folder, but sync also propagates deletions and corruption — keep exported backups as well.

## Exporting a chart

Open a chart and use **Export** in the toolbar. Export the entire chart, or tick specific people and optionally pull in everyone reporting into them and/or their management chain.

| Format | Use it for |
| --- | --- |
| SVG | PowerPoint. Insert → Pictures → This device; it stays sharp at any size (and editable via Graphic → Convert to Shape). |
| PNG | A flat picture for slides, docs, or chat. Rendered at 2× for crisp text. |
| CSV | Excel, or bulk review of names, titles, managers, sponsors, notes, and tags. |
| JSON | Structured data, including notes, tags, and saved positions. |
| Portable package (ZIP) | Add the chart to another orgchartr installation, including sponsors, photos, and mappings. |

Photos are embedded in SVG and PNG exports. Portable packages include referenced photos as separate files inside the ZIP.

## Troubleshooting

- **"docker: command not found" or the app won't start.** Docker Desktop isn't running. Start it and wait for its status to show *Running*, then try `docker compose up -d --build` again.
- **Port 3000 is already in use.** Something else is using that port. Stop the other program, or change the published port in `docker-compose.yml` (for example `127.0.0.1:3001:3000`) and open http://localhost:3001 instead.
- **The page is blank or won't load.** Give it a few seconds after `up` for the container to start, then refresh. Check it's running with `docker compose ps`; view logs with `docker compose logs -f`.
- **Where's my data?** In the folder shown by `ORGCHARTR_DATA_DIR` in `.env`, or the default `./data` folder if you haven't set one.
- **(Linux) Charts won't save / the app looks read-only.** The container runs as a non-root user (uid 1000), so it needs write access to your data folder. Make it writable with `sudo chown -R 1000:1000 /path/to/your/data-folder` (Docker Desktop on Windows and macOS handles this automatically).
- **Start fresh.** `docker compose down` stops everything; your data folder is never deleted by removing or rebuilding the container.

## Exposing it on a network (advanced)

By default the app is published on `127.0.0.1:3000`, so only this machine can reach it. orgchartr has **no authentication** — anyone who can reach the port has full access to every stakeholder record and can delete or replace all data. If you understand that and still want LAN access, change the `ports` entry in `docker-compose.yml` from `127.0.0.1:3000:3000` to `3000:3000` and rebuild. On a Linux host, remember that Docker's firewall rules can bypass `ufw`.

## For developers

Running orgchartr needs only Docker. If you want to work on the code, see [`AGENTS.md`](AGENTS.md) for architecture and conventions.

Requires Node.js 20+:

```bash
npm install
npm run dev
```

This runs the Express API on port 3001 and the Vite dev server (with hot reload) on 5173, proxying `/api` and `/photos` to the API. Open **http://localhost:5173**. Set `DATA_DIR` before `npm run dev` to use a folder other than `./data`.

```
frontend/   React + TypeScript + React Flow canvas UI
server/     Express + TypeScript API, reads/writes DATA_DIR
docs/       Getting-started and "why" guides
scripts/    Data-folder pickers (Windows and macOS/Linux)
data/       Default (ignored) data folder
```

## Good to know

- Deleting a person reparents their direct reports to that person's own manager (or makes them roots) rather than orphaning them.
- The manager dropdown won't let you pick yourself or one of your own reports, so the chart can't form a loop.
- Filtering and searching fade non-matching people rather than hiding them, so matches keep their place in the org structure.
