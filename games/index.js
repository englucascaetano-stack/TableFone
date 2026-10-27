'use strict';
// Biblioteca de jogos: cada subpasta com um game.js e registrada automaticamente.
const fs = require('fs');
const path = require('path');

const library = {};
for (const entry of fs.readdirSync(__dirname, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = path.join(__dirname, entry.name, 'game.js');
  if (!fs.existsSync(file)) continue;
  const game = require(file);
  library[game.id] = game;
}

function list() {
  return Object.values(library).map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    minPlayers: g.minPlayers,
    maxPlayers: g.maxPlayers,
    roles: g.roles,
    hasPrivate: typeof g.viewFor === 'function',
  }));
}

module.exports = { library, list };
