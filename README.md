# orgchartr

**Living org charts of the partner organisations you work with, cross-linked to the sponsors who own each relationship — running on your own machine, with the data in a folder you choose.**

orgchartr is for anyone leading through partners or stakeholders who needs to *see* — at a glance — who is who in a partner's organisation, who reports to whom, and which sponsor covers each person. It's built to take the mental load off remembering all of that, and to let a virtual team share one clear picture. Charts export cleanly into PowerPoint, so they slot straight into your notes and planning.

New here? Start with the plain-English [**Getting started guide**](docs/GETTING-STARTED.md). Wondering why this over PowerPoint, Excel, or a CRM? See [**Why orgchartr?**](docs/WHY-ORGCHARTR.md).

- One org chart per partner (or team) — add, edit, and remove people, and draw the reporting lines between them.
- Each person carries a title, department, tags, a photo, free-text **notes** (decisions they own, how they like to be contacted, anything worth remembering), and links to one or more sponsors.
- A shared, reusable sponsor directory you can link to any person on any chart.
- Export a whole chart, or chosen branches and people, as SVG, PNG, CSV, Excel, or JSON.
- Runs as a static site in Docker or on any web host; the app works entirely in your browser against a folder on your computer.
- Stores its data in a folder you choose. The app never uploads, syncs, or backs up that folder for you.

## Quickstart

1. **Install Docker Desktop.** Get it from [docker.com](https://www.docker.com/products/docker-desktop/) and start it (wait for the whale icon to settle).
2. **Start orgchartr.** In a terminal, from this folder, run the command for your system:

   macOS or Linux:
   ```console
   bash ./scripts/docker-up.sh
   ```

   Windows PowerShell:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\docker-up.ps1
   ```
3. **Open it in Chrome or Edge** at **http://localhost:3000**, choose a data folder, and grant read/write access.

That's the whole setup. Docker only serves the app; your browser reads and writes the folder directly. To stop it later, run `docker compose down` (your data folder is left untouched).

> **It runs on this computer only.** orgchartr has no login, so Docker deliberately publishes it only on this machine. See [Network access](#network-access) before changing that.

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or another Docker Engine + Compose setup).
- A Chromium-based browser such as Chrome or Edge. Firefox and Safari do not support choosing a local folder.

## Choosing where your data is stored

Open **http://localhost:3000** in Chrome or Edge and choose a folder when prompted. Pick an empty folder to start fresh, an existing orgchartr data folder to continue, or a folder containing an unzipped backup. The browser remembers the folder handle but may ask you to confirm access again on a later visit.

Docker never mounts or reads this folder. Use **Switch folder…** on the dashboard to change it without restarting the container, or **Lock and forget** to clear the remembered folder handle from orgchartr. Browser site settings remain the authoritative place to revoke a persistent folder permission.

Use a dedicated folder for orgchartr. The app marks empty folders when first opened and rejects unrelated non-empty folders before writing anything. Existing orgchartr folders and unzipped backups require a one-time confirmation before they are marked.

If the browser asks again later, select **Reopen folder** and approve access. Cancelling the prompt or choosing a different folder does not delete the original files.

### Moving existing data to a new folder

Close orgchartr tabs that have the old folder open, copy the folder using Explorer or Finder, then use **Switch folder…** and choose the copy. Do not edit the same folder from multiple orgchartr tabs or devices at once.

## How your data is stored

The data folder contains:

- `charts/index.json` — the list of charts shown on the dashboard
- `charts/{chartId}.json` — one file per org chart (people, reporting lines, notes, tags, sponsor links)
- `charts/history/` — recent automatic snapshots you can restore from
- `sponsors.json` — the shared sponsor directory
- `assets/photos/` — uploaded photos

It's plain JSON and images — nothing proprietary. You can read it, copy it, or back it up like any other folder.

## A note on the data you're storing

orgchartr holds **real names and job details of people who work at partner organisations** — that is personal data. A few sensible habits:

- Keep the data folder somewhere appropriate for work information (e.g. your corporate OneDrive), not a shared or public location.
- The app has no login and is bound to this machine only; keep it that way unless you have a specific reason not to.
- Use the exports below for backups, and keep those backups under whatever retention your organisation expects for this kind of data.

## Backups and portability

- **One chart:** open a chart, choose **Export → Portable package (ZIP)**. The ZIP contains the selected people, their sponsor links, referenced sponsors, and photos. Use **Import chart package** on the dashboard to add it elsewhere without disturbing existing data.
- **The whole installation:** use **Export backup** on the dashboard for a single ZIP of all charts, history, sponsors, and photos. To restore it, unzip the archive and open that folder in orgchartr.

The in-app ZIP is a point-in-time copy, not an off-device backup service. OneDrive sync gives you another copy of the live folder, but sync also propagates deletions and corruption — keep exported backups as well.

## Exporting a chart

Open a chart and use **Export** in the toolbar. Export the entire chart, or tick specific people and optionally pull in everyone reporting into them and/or their management chain.

| Format | Use it for |
| --- | --- |
| SVG | PowerPoint. Insert → Pictures → This device; it stays sharp at any size (and editable via Graphic → Convert to Shape). |
| PNG | A flat picture for slides, docs, or chat. Rendered at 2× for crisp text. |
| CSV | Excel, or bulk review of names, titles, managers, sponsors, notes, and tags. |
| Excel sponsorship matrix | A filterable `.xlsx` workbook with one stakeholder per row and one column per sponsor. Filter a sponsor column to `X` to see everyone they cover. |
| JSON | Structured data, including notes, tags, and saved positions. |
| Portable package (ZIP) | Add the chart to another orgchartr installation, including sponsors, photos, and mappings. |

Photos are embedded in SVG and PNG exports. Portable packages include referenced photos as separate files inside the ZIP.

## Troubleshooting

- **"docker: command not found" or the app won't start.** Docker Desktop isn't running. Start it and wait for its status to show *Running*, then run the start command above again.
- **The Docker build reports an npm network error.** The start scripts use `NPM_REGISTRY` when set, otherwise your host npm registry when npm is installed, otherwise public npm. If your managed device has no host npm configuration, add `NPM_REGISTRY=https://your-company-package-feed/npm/` to the ignored `.env` file and rerun the script. The registry must mirror every version in `package-lock.json`.
- **Port 3000 is already in use.** Something else is using that port. Stop the other program, or change the published port in `docker-compose.yml` (for example `127.0.0.1:3001:8080`) and open http://localhost:3001 instead.
- **The page is blank or won't load.** Give it a few seconds after `up` for the container to start, then refresh. Check it's running with `docker compose ps`; view logs with `docker compose logs -f`.
- **Where's my data?** In the folder shown on the dashboard. Docker has no access to it; Chrome or Edge reads and writes it directly.
- **The folder picker does not appear.** Open the app in Chrome or Edge at `http://localhost:3000`. Local folder access requires a Chromium browser and a secure context such as localhost.
- **Start fresh.** `docker compose down` stops everything; your data folder is never deleted by removing or rebuilding the container.

## Static hosting without Docker (advanced)

The Docker image is a static nginx site. You can publish the same frontend on another static web host instead. On first visit, orgchartr asks for a folder and then reads and writes the charts, sponsors, and photos directly through the browser's File System Access API. The web host receives no chart data; it only serves the app's HTML, JavaScript, and CSS.

Good to know:

- **Browser support.** Picking a local folder requires a Chromium-based browser (Chrome, Edge, Opera). Firefox and Safari can't grant folder access; the app shows a clear message instead.
- **Same data format.** Docker and another static host can open the same orgchartr folder. Do not open and edit one folder in both at the same time.
- **Permissions.** The browser remembers your folder between visits, but may ask you to confirm access again when you return (one click). Chrome/Edge offer "Allow on every visit" to skip even that.
- **Backups.** Copying the data folder is a complete backup. **Export backup** produces a ZIP; restore it by unzipping it and opening that folder. Chart packages import and export as normal.

To deploy it yourself, build the frontend with the local-only flag and publish `frontend/dist/` on any static host.

macOS or Linux:

```console
npm install
npm run build -w shared
VITE_FORCE_LOCAL_MODE=true npm run build -w frontend
```

PowerShell:

```powershell
npm install
npm run build -w shared
$env:VITE_FORCE_LOCAL_MODE = 'true'
npm run build -w frontend
```

Serve the output over HTTPS (or localhost), because browser folder access requires a secure context. If you host under a sub-path, set Vite's [`base`](https://vite.dev/config/shared-options.html#base) accordingly.

For a public deployment:

- Publish only the static local-folder build. Do not expose the Express development server or add a data volume.
- Terminate TLS at a trusted ingress or static host, redirect HTTP to HTTPS, and enable HSTS after HTTPS is verified.
- Preserve the response headers and static route allowlist in `docker/nginx.conf`. `/api/*`, `/photos/*`, unknown paths, and non-read methods must remain unavailable.
- Treat control of the web origin and deployment pipeline as access to any folder a returning browser permits the app to open. Restrict release access, pin dependencies and container images, and scan each release.
- Set a short retention period for ingress and container access logs. The included nginx format omits query strings, referrers, and user agents.

See [SECURITY.md](SECURITY.md) for the complete supported deployment boundary and operator checklist.

## Network access

The Docker app is deliberately published only on `127.0.0.1`. File System Access requires a secure browser context; plain HTTP from another machine on the LAN does not qualify. Use a properly configured HTTPS static host for shared deployment rather than exposing the local Docker port.

## For developers

Running orgchartr needs only Docker. If you want to work on the code, see [`AGENTS.md`](AGENTS.md) for architecture and conventions.

Requires Node.js 20+:

```bash
npm install
npm run dev
```

This runs the Express API on port 3001 and the Vite dev server (with hot reload) on 5173, proxying `/api` and `/photos` to the API. Open **http://localhost:5173**. Set `DATA_DIR` before `npm run dev` to use a folder other than `./data`.

```
shared/     Pure TypeScript domain logic + types used by both frontend and server
frontend/   React + TypeScript + React Flow canvas UI (server mode + local-folder mode)
server/     Express + TypeScript API, reads/writes DATA_DIR
docs/       Getting-started and "why" guides
data/       Default server-mode development data (ignored)
```

## Good to know

- Deleting a person reparents their direct reports to that person's own manager (or makes them roots) rather than orphaning them.
- The manager dropdown won't let you pick yourself or one of your own reports, so the chart can't form a loop.
- Filtering and searching fade non-matching people rather than hiding them, so matches keep their place in the org structure.
