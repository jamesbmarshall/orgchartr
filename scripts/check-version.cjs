const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const manifestPaths = ['package.json', 'frontend/package.json', 'server/package.json', 'shared/package.json'];
const manifests = manifestPaths.map((relativePath) => ({
  relativePath,
  package: JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')),
}));
const canonicalVersion = manifests[0].package.version;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

if (!semverPattern.test(canonicalVersion)) {
  throw new Error(`Root package version "${canonicalVersion}" is not valid SemVer.`);
}

for (const manifest of manifests.slice(1)) {
  if (manifest.package.version !== canonicalVersion) {
    throw new Error(
      `${manifest.relativePath} has version ${manifest.package.version}; expected ${canonicalVersion}.`,
    );
  }
}

const releaseTag = process.env.RELEASE_TAG;
if (releaseTag && releaseTag !== `v${canonicalVersion}`) {
  throw new Error(`Release tag ${releaseTag} does not match package version v${canonicalVersion}.`);
}

console.log(`Version ${canonicalVersion}${releaseTag ? ` matches ${releaseTag}` : ' is consistent across workspaces'}.`);