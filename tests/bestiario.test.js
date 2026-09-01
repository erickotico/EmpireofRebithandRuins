const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeRarityKey,
  resolveRewardRarity,
  getDropChance,
  setupModalCloseHandlers
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

test('setupModalCloseHandlers fecha ao clicar no botão X e no fundo do overlay', () => {
  const modal = {
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    }
  };

  let closed = 0;
  setupModalCloseHandlers(modal, () => { closed += 1; });

  modal.listeners.click({ target: modal });
  assert.equal(closed, 1);

  const closeButton = { closest: (selector) => selector === '.modal-close' ? true : null };
  modal.listeners.click({ target: closeButton, stopPropagation() {} });
  assert.equal(closed, 2);
});
