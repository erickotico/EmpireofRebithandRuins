const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeRarityKey,
  resolveRewardRarity,
  getDropChance
} = require('../js/bestiario.js');

test('normaliza raridades com acentos e caixa', () => {
  assert.equal(normalizeRarityKey('Lendário'), 'lendario');
  assert.equal(normalizeRarityKey('Épico'), 'epico');
  assert.equal(normalizeRarityKey('deus'), 'deus');
});

test('resolveRewardRarity prioriza raridades por array e não devolve undefined', () => {
  assert.equal(resolveRewardRarity({ raridades: ['Raro', 'Comum'] }), 'Raro');
  assert.equal(resolveRewardRarity({ raridade: 'Épico' }), 'Épico');
  assert.equal(resolveRewardRarity({}), 'Comum');
});

test('getDropChance resolve raridades em letras com acento', () => {
  assert.equal(getDropChance('Lendário'), 25);
  assert.equal(getDropChance('Épico'), 35);
});
