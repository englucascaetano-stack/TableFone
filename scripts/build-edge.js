'use strict';
// Gera os modulos de regras da Edge Function a partir de games/<id>/game.js
// (fonte unica das regras: o servidor local usa o original; a nuvem usa esta copia em ESM).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'supabase', 'functions', 'mesa', 'games');
fs.mkdirSync(outDir, { recursive: true });

const ids = [];
for (const entry of fs.readdirSync(path.join(root, 'games'), { withFileTypes: true })) {
  const file = path.join(root, 'games', entry.name, 'game.js');
  if (!entry.isDirectory() || !fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  if (!src.includes('module.exports = {')) throw new Error(`${file}: esperado "module.exports = {"`);
  fs.writeFileSync(
    path.join(outDir, `${entry.name}.mjs`),
    `// GERADO por scripts/build-edge.js a partir de games/${entry.name}/game.js. Nao edite.\n` +
      src.replace('module.exports = {', 'export default {')
  );
  ids.push(entry.name);
}

const index =
  '// GERADO por scripts/build-edge.js. Nao edite.\n' +
  ids.map((id, i) => `import g${i} from './${id}.mjs';`).join('\n') +
  `\nexport const library = {};\nfor (const g of [${ids.map((_, i) => `g${i}`).join(', ')}]) library[g.id] = g;\n`;
fs.writeFileSync(path.join(outDir, 'index.mjs'), index);
console.log('Regras geradas para a nuvem:', ids.join(', '));
