const fs = require('node:fs');
const path = require('node:path');

const assetsDir = path.resolve(__dirname, '../frontend/dist/assets');
const forbidden = [
  '/api/health',
  '/api/charts',
  '/api/sponsors',
  '/api/photos',
  '/api/backup',
  '/api/packages',
];

if (!fs.existsSync(assetsDir)) {
  throw new Error('Frontend build output is missing. Build the frontend before checking it.');
}

const violations = [];
for (const filename of fs.readdirSync(assetsDir)) {
  if (!filename.endsWith('.js')) continue;
  const source = fs.readFileSync(path.join(assetsDir, filename), 'utf8');
  for (const endpoint of forbidden) {
    if (source.includes(endpoint)) violations.push(`${filename}: ${endpoint}`);
  }
}

if (violations.length > 0) {
  throw new Error(`The local-only bundle contains server API code:\n${violations.join('\n')}`);
}

console.log('Verified local-only bundle: no server API endpoints found.');