# Releasing orgchartr

orgchartr uses [Semantic Versioning](https://semver.org/) and publishes from immutable Git tags. The root package version is canonical; the frontend, server, shared package, and lockfile carry the same version so local builds and release artifacts agree.

The application version is separate from the format versions used by data folders, backups, and chart packages. Change those format constants only when their persisted formats change.

## Version policy before 1.0

- Increment the patch version for compatible fixes, for example `0.9.0` to `0.9.1`.
- Increment the minor version for features or intentional breaking changes, for example `0.9.1` to `0.10.0`.
- Use `1.0.0` when the product and its supported deployment contract are ready to be declared stable.

Releases before `1.0.0` are created as GitHub pre-releases.

## Prepare a release

Start from an up-to-date `master` branch with a clean worktree. Choose the next version, then update every workspace and the lockfile without creating a tag:

```console
npm version 0.9.1 --workspaces --include-workspace-root --no-git-tag-version
npm run version:check
```

Review the manifest and lockfile changes. Run the same checks used before publication:

```console
npm run lint -w frontend
npm run build
npm run verify:local-bundle
npm audit --audit-level=high
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
```

Open a pull request for the version change and any release work. Merge it only after CI passes on the pull request. Wait for CI to pass on `master` as well.

## Publish

Create the exact `v<version>` tag on the tested `master` commit and push it:

```console
git switch master
git pull --ff-only
RELEASE_VERSION=0.9.1
npm run version:check
git tag -a "v$RELEASE_VERSION" -m "orgchartr v$RELEASE_VERSION"
git push origin "v$RELEASE_VERSION"
```

The Release workflow checks that the tag matches every package manifest. It then repeats linting, builds, bundle validation, dependency audit, container smoke tests, hardening checks, SBOM generation, and vulnerability scanning. Publication starts only after those checks pass.

A successful run publishes:

- a GitHub pre-release with generated release notes and `sbom.cdx.json`;
- `ghcr.io/jamesbmarshall/orgchartr:<version>` as the immutable rollback image;
- `ghcr.io/jamesbmarshall/orgchartr:<major>.<minor>` and `latest` as moving image tags;
- one image manifest supporting `linux/amd64` and `linux/arm64`, with provenance and SBOM attestations.

## Verify the release

1. Open the GitHub Release and check its tag, generated notes, pre-release status, and attached CycloneDX SBOM.
2. Check the GHCR package lists both `linux/amd64` and `linux/arm64` for the version tag.
3. Pull without signing in: `docker pull ghcr.io/jamesbmarshall/orgchartr:<version>`.
4. Set `ORGCHARTR_VERSION=<version>` and run the normal start script.
5. Open the dashboard and a chart. Confirm the footer reports the same version and links to the matching GitHub Release.
6. Confirm edits still stay in the browser-selected folder and browser network tools show no chart data sent to the host.

## First release package settings

The first workflow run creates the GHCR package. In the package settings on GitHub:

1. Connect the package to `jamesbmarshall/orgchartr` if GitHub has not linked it automatically.
2. Grant this repository Actions access.
3. Change package visibility to **Public**.
4. Repeat the unauthenticated pull check from a Docker client that is not logged in to GHCR.

Do not add a personal access token or package administration credential to this repository. The workflow publishes with its short-lived `GITHUB_TOKEN`.

## Failure and rollback

Do not move, delete, or recreate a published release tag. Fix the problem on a new commit and publish a new patch version. A failed workflow can be rerun against the same tag only when it has not published incorrect source content; the GitHub Release upload step is safe to rerun.

To roll an installation back, set the immutable version in `.env` and rerun the start script:

```dotenv
ORGCHARTR_VERSION=0.9.0
```

The app does not alter data-format versions during an application rollback. Check migration notes before rolling back any future release that changes a persisted format.