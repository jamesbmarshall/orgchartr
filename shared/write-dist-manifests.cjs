// Marks each emitted flavour with its module type so Node and bundlers
// interpret dist/esm as ESM even though the package root is CommonJS.
const fs = require('fs');
const path = require('path');

fs.writeFileSync(path.join(__dirname, 'dist', 'esm', 'package.json'), '{ "type": "module" }\n');
fs.writeFileSync(path.join(__dirname, 'dist', 'cjs', 'package.json'), '{ "type": "commonjs" }\n');
