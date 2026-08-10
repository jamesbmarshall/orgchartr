# Security

## Supported public deployment

The supported internet-facing architecture is a static, local-folder-only application:

- nginx serves HTML, JavaScript, CSS, and two static SVG assets;
- the browser reads and writes a dedicated folder selected by the user;
- the container has no user-data mount and receives no charts, notes, sponsors, or photos;
- `/api/*` and `/photos/*` do not exist in the production image.

Authentication is not required for this public static UI because the host stores no organisation data. Access to the UI does not grant access to another user's folder. The browser's File System Access permission remains the data-access boundary.

The Express service under `server/` is for development and compatibility. It has no user authentication or per-chart authorization and must not be exposed to the public internet.

## Public-hosting checklist

1. Build with `VITE_STORAGE_MODE=local` and run `npm run verify:local-bundle`.
2. Publish only the final static image. Do not add Express, a user-data volume, or a server adapter to it.
3. Terminate HTTPS at a trusted ingress, redirect HTTP, and add HSTS only after HTTPS is working for the production hostname.
4. Keep the container behind the ingress. Do not publish its HTTP port directly to the internet.
5. Preserve the nginx content security policy, frame denial, MIME-sniff protection, permissions policy, static route allowlist, and cache rules.
6. Run the container as its configured non-root user with a read-only root filesystem, no capabilities, `no-new-privileges`, and resource limits.
7. Run `npm audit --audit-level=high`, generate an SBOM, and scan the final container image before release.
8. Restrict who can change source, dependencies, CI, DNS, TLS, hosting configuration, and production artifacts. A malicious application bundle can use folder access already granted to that origin.
9. Minimise access logs and set a documented retention period. The included nginx format retains source IP, timestamp, method, path without query, status, and response size.
10. Test that browser network tools show no chart, note, sponsor, or photo uploads during open, edit, import, backup, and export workflows.

## User-data handling

- Select a dedicated empty or existing orgchartr folder. The app rejects unrelated non-empty folders before writing and marks accepted folders with `.orgchartr-data.json`.
- **Lock and forget** clears orgchartr's remembered folder handle without deleting data. Revoke persistent access through the browser's site settings when required.
- Data files and exports are plaintext JSON, CSV, ZIP, SVG, PNG, and image files. Store them in a location approved for work data and protected by device or managed-drive encryption.
- Backups and portable packages contain personal data and may contain photos. Apply the same access, retention, and sharing controls as the live folder.
- In local-folder mode, new JPEG, PNG, and WebP uploads and package imports are decoded and re-encoded in the browser before storage, removing EXIF, XMP, and other source metadata.
- Existing stored photos are not rewritten automatically. Replace pre-existing photos if their metadata has not already been removed.
- Animated GIFs remain byte-for-byte because canvas re-encoding would discard animation. Remove sensitive GIF metadata before upload or use another supported format.

## Untrusted files

Chart package imports validate archive paths, duplicate paths, file counts, declared entry sizes, total expanded size, JSON structure, image signatures, IDs, manager references, and manager cycles. Browser imports are decompressed asynchronously with checks applied before inflation. Persisted JSON, photos, archives, and CSV imports also have pre-read size limits.

Only import packages, CSV files, and backups from sources you trust. Validation limits denial-of-service and content-injection risk but does not establish who created a file.

## If server-side storage is introduced

Do not adapt the static deployment by simply exposing `server/`. A hosted-data service requires, at minimum:

- OIDC authentication and secure session handling;
- tenant/chart authorization on every API and photo request;
- authenticated, non-enumerable photo delivery;
- CSRF protection for browser sessions;
- endpoint-specific rate, request-size, timeout, and concurrency limits;
- transactional persistence and tested restore recovery;
- protected backups, encryption at rest, audit logs, monitoring, and retention controls;
- a separate threat model and penetration test.

## Reporting a vulnerability

Report security issues privately through the repository's GitHub Security Advisory feature. Do not include real organisation data, photos, credentials, or sensitive folder contents in a report.