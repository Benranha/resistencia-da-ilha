'use strict';
const fs = require('fs');
const path = require('path');

const buildDir = path.dirname(require.resolve('three'));
const packageJson = JSON.parse(fs.readFileSync(path.join(buildDir, '..', 'package.json'), 'utf8'));
const targetDir = path.join(__dirname, '..', 'public', 'vendor', 'three');
const requiredFiles = ['three.module.js', 'three.core.js'];

fs.mkdirSync(targetDir, { recursive: true });
for (const file of requiredFiles) {
  const source = path.join(buildDir, file);
  if (!fs.existsSync(source)) throw new Error(`Arquivo do Three.js não encontrado: ${source}`);
  fs.copyFileSync(source, path.join(targetDir, file));
}
console.log(`Three.js ${packageJson.version} copiado para public/vendor/three.`);
