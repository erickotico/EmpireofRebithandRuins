const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeClassColor } = require('../js/colorUtils.js');

test('retorna a cor de fallback quando a cor vem vazia', () => {
  assert.equal(normalizeClassColor('', '#8b5cf6'), '#8b5cf6');
});

test('preserva uma cor hexadecimal válida', () => {
  assert.equal(normalizeClassColor('#ff00aa', '#8b5cf6'), '#ff00aa');
});
