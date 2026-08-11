# Getting started with orgchartr

This guide walks you through setting up orgchartr and building your first chart. It assumes no technical background. Allow about 15 minutes, most of which is Docker installing.

You need Chrome or Edge as your browser. Firefox and Safari cannot grant access to a local folder.

If anything goes wrong, the [Troubleshooting section of the README](../README.md#troubleshooting) covers the common snags.

---

## Step 1 — Install Docker Desktop

orgchartr runs inside **Docker**, a free tool that lets an app run in a self-contained bubble on your computer. You install it once.

1. Go to **https://www.docker.com/products/docker-desktop/** and download Docker Desktop for your system (Windows, macOS, or Linux).
2. Run the installer and accept the defaults.
3. Start Docker Desktop. The first launch can take a minute; wait until its whale icon (in your menu bar or system tray) stops animating and shows *Running*.

You don't need to understand Docker or create any account with it. It just needs to be running whenever you use orgchartr.

## Step 2 — Get the orgchartr files

If someone shared the orgchartr folder with you, put it somewhere sensible (like your Documents folder). If you're fetching it from GitHub, use the green **Code → Download ZIP** button and unzip it.

You should end up with a folder called `orgchartr` containing files like `README.md` and `docker-compose.yml`.

## Step 3 — Start orgchartr

1. Open a terminal **in the orgchartr folder**:
   - **Windows:** in File Explorer, click the address bar, type `powershell`, and press Enter.
   - **macOS:** right-click the folder in Finder → *New Terminal at Folder* (or open Terminal and `cd` into it).
   - **Linux:** right-click the folder in your file manager and choose *Open in Terminal*.
2. Type the command for your system and press Enter.

   **macOS or Linux:**
   ```console
   bash ./scripts/docker-up.sh
   ```

   **Windows PowerShell:**
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\docker-up.ps1
   ```
3. The first run downloads and builds things — this can take a few minutes. When it finishes and returns you to the prompt, orgchartr is running.

## Step 4 — Open it and choose your data folder

Open Chrome or Edge and go to **http://localhost:3000**. Select **Choose folder…**, then choose an empty folder to start fresh or an existing orgchartr data folder to continue. The browser reads and writes that folder directly; Docker never sees its contents.

After granting access, you'll see the orgchartr dashboard. It's empty for now — let's fix that.

The browser remembers your choice. If it asks for permission on a later visit, select **Reopen folder** and approve access. Cancelling the prompt does not delete your files. Use **Switch folder…** on the dashboard whenever you want to work from another folder.

> orgchartr only opens on the computer it's running on. That's on purpose: it has no password, so it isn't exposed to anyone else on your network.

## Step 5 — Create your first chart

1. On the dashboard, type a partner or team name (for example `Contoso`) into the **new chart** box and create it.
2. Click the chart to open it. You'll see an empty canvas with an **Add your first person** button in the middle.

## Step 6 — Add a person

1. Click **Add your first person** (or **Add person** in the toolbar).
2. Fill in what you know:
   - **Name** (the only required field) and **Title**.
   - **Department**, if useful.
   - **Notes** — this is the useful bit. Jot down what you want to remember about them: *"Owns the cloud-migration decision. Prefers email. Met at the Q2 review. Team is reorganising in the autumn."* It shows up on their card so you don't have to hold it in your head.
   - **Manager** — leave as *top of chart* for the first person; for later people, pick who they report to and orgchartr draws the line.
3. Save. Their card appears on the canvas.

Add a few more people, setting each one's manager, and orgchartr arranges them into a tidy tree. You can also drag a line from the bottom of one person's card to another to set who reports to whom.

## Step 7 — Link a sponsor

A **sponsor** is anyone who owns or supports the relationship with someone on the chart. Sponsors live in a shared directory so you can reuse them across every chart.

1. Edit a person (the pencil icon on their card).
2. In the **Sponsors** box, start typing a name. If they already exist, pick them; if not, type the full name and it's created for you when you save.
3. Save. The person's card now shows who sponsors them, and you can filter a chart by sponsor to see everyone one person covers.

## Step 8 — Put it in a slide

When you want the chart in PowerPoint:

1. Click **Export** in the toolbar.
2. Choose the whole chart or tick specific people (optionally pulling in their reports or management chain).
3. Pick **SVG** for PowerPoint (it stays crisp at any size), then insert it in your slide via **Insert → Pictures → This device**.

There are other formats too — PNG for a flat image, CSV for detailed rows, JSON for the full data, and a portable ZIP for sharing a chart with another orgchartr user.

Choose **Excel sponsorship matrix** when you want to review relationship coverage. The workbook has one stakeholder per row and one column per sponsor; filter a sponsor column to `X` to see everyone assigned to them. Your whole-chart or selected-branch choice applies to this export too.

---

## Everyday tips

- **Stop it** when you're done: run `docker compose down` in the orgchartr folder. Your data stays put.
- **Start it again** anytime with `docker compose up -d` (no `--build` needed unless the app was updated).
- **Back it up:** use **Export backup** on the dashboard, or close orgchartr and copy the whole data folder. Restore an exported backup by unzipping it and opening that folder.
- **Search and filter** from the chart toolbar — non-matching people fade rather than disappear, so matches keep their place in the structure.
- **Made a mistake?** Deleting a person gives you a few seconds to undo, and the **history** button restores earlier versions of a chart.

If you get stuck, the [README troubleshooting list](../README.md#troubleshooting) has the fixes for the usual problems.
