// Testes das funções compartilhadas (js/gameData.js). Rodar: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const G = require('../js/gameData.js');
const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'gameRules.json'), 'utf8'));

test('getMatchups segue a tabela do DA_ElementChart', () => {
  assert.deepEqual(G.getMatchups(rules, 'fire'), { strong: ['wind', 'ice'], weak: ['water', 'earth'] });
  assert.deepEqual(G.getMatchups(rules, 'poison').strong, ['water', 'earth', 'light']);
  assert.deepEqual(G.getMatchups(rules, 'ice').weak, ['fire']);
  assert.deepEqual(G.getMatchups(rules, 'environment'), { strong: [], weak: [] });
});

test('formatStat mostra null como "a definir" e a chance de crítico em %', () => {
  assert.equal(G.formatStat('health', null), null);
  assert.equal(G.formatStat('criticalChance', 15, 'pt'), '15%');
  assert.equal(G.formatStat('criticalDamage', 1.5, 'pt'), '1,5');
  assert.equal(G.formatStat('criticalDamage', 1.5, 'en'), '1.5');
});

test('resolveMonster: variante herda o que estiver vazio e mantém o que é dela', () => {
  const base = {
    id: 'wolf', variantOf: null, rarity: 'common', element: 'earth', levelMin: 25, levelMax: 50,
    region: { pt: 'Floresta', en: 'Forest' }, stats: { health: 70 }, skills: [{ name: { pt: 'Mordida' } }], drops: [], states: ['ancient']
  };
  const variant = {
    id: 'wolf-snow-wolf', variantOf: 'wolf', rarity: 'uncommon', element: 'ice', levelMin: null, levelMax: null,
    region: { pt: '', en: '' }, stats: null, skills: [], drops: [], states: []
  };
  const resolved = G.resolveMonster(variant, { wolf: base });
  assert.equal(resolved.element, 'ice');
  assert.equal(resolved.rarity, 'uncommon');
  assert.equal(resolved.levelMin, 25);
  assert.deepEqual(resolved.stats, { health: 70 });
  assert.equal(resolved.region.pt, 'Floresta');
  assert.equal(resolved.skills.length, 1);
  assert.equal(resolved.inherited.stats, true);
  assert.equal(resolved.inherited.drops, false);
});

test('esc impede HTML vindo dos dados', () => {
  assert.equal(G.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(G.esc(null), '');
});

test('matchesSearch procura nos dois idiomas e ignora acentos', () => {
  assert.equal(G.matchesSearch('aguia', [{ pt: 'Águia', en: 'Eagle' }]), true);
  assert.equal(G.matchesSearch('eagle', [{ pt: 'Águia', en: 'Eagle' }]), true);
  assert.equal(G.matchesSearch('lobo', [{ pt: 'Águia', en: 'Eagle' }]), false);
  assert.equal(G.matchesSearch('', []), true);
});
