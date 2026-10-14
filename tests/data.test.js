// Confere a consistência dos arquivos em data/ (o painel grava neles). Rodar: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const read = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', file), 'utf8'));
const rules = read('gameRules.json');
const monsters = read('monsterData.json').monsters;
const classes = read('classesData.json').classes;
const dungeons = read('masmorras.json');
const kingdoms = read('reinos.json');
const updates = read('updates.json').updates;

const ids = (list) => new Set(list.map((entry) => entry.id));
const elementIds = new Set([...ids(rules.elements), ...ids(rules.specialElements)]);
const hasPt = (field) => !!(field && typeof field === 'object' && String(field.pt || '').trim());

test('a tabela de elementos só aponta para elementos que existem', () => {
  const known = ids(rules.elements);
  rules.elements.forEach((element) => element.beats.forEach((id) => assert.ok(known.has(id), `${element.id} → ${id}`)));
});

test('monstros: IDs únicos, variantes apontam para um monstro base existente', () => {
  const all = monsters.map((m) => m.id);
  assert.equal(new Set(all).size, all.length, 'ID repetido');
  const bases = new Set(monsters.filter((m) => !m.variantOf).map((m) => m.id));
  monsters.filter((m) => m.variantOf).forEach((m) => assert.ok(bases.has(m.variantOf), `${m.id} → ${m.variantOf}`));
});

test('monstros: elemento, raridade, hostilidade, tipos e estados válidos', () => {
  const rarities = ids(rules.rarities);
  const hostilities = ids(rules.hostilities);
  const types = ids(rules.monsterTypes);
  const states = ids(rules.monsterStates);
  monsters.forEach((m) => {
    assert.ok(hasPt(m.name), `${m.id}: nome sem PT`);
    if (m.element) assert.ok(elementIds.has(m.element), `${m.id}: elemento ${m.element}`);
    if (m.rarity) assert.ok(rarities.has(m.rarity), `${m.id}: raridade ${m.rarity}`);
    if (m.hostility) assert.ok(hostilities.has(m.hostility), `${m.id}: hostilidade ${m.hostility}`);
    (m.types || []).forEach((t) => assert.ok(types.has(t), `${m.id}: tipo ${t}`));
    (m.states || []).forEach((s) => assert.ok(states.has(s), `${m.id}: estado ${s}`));
    (m.drops || []).forEach((d) => (d.rarities || []).forEach((r) => assert.ok(rarities.has(r), `${m.id}: drop ${r}`)));
  });
});

test('monstros base têm atributos com as chaves do jogo (ou null = a definir)', () => {
  const keys = rules.attributes.map((a) => a.id).sort();
  monsters.filter((m) => m.stats).forEach((m) => assert.deepEqual(Object.keys(m.stats).sort(), keys, m.id));
});

test('classes: atributos completos, armas válidas e subclasses com ID único', () => {
  const keys = rules.attributes.map((a) => a.id).sort();
  const weapons = ids(rules.weapons);
  const subIds = [];
  classes.forEach((c) => {
    assert.ok(hasPt(c.name), c.id);
    assert.deepEqual(Object.keys(c.stats).sort(), keys, c.id);
    c.weapons.forEach((w) => assert.ok(weapons.has(w), `${c.id}: arma ${w}`));
    c.subclasses.forEach((s) => subIds.push(s.id));
  });
  assert.equal(new Set(subIds).size, subIds.length, 'subclasse repetida');
});

test('masmorras: rank válido e monstros ligados existem no bestiário', () => {
  const ranks = ids(rules.ranks);
  const monsterIds = ids(monsters);
  dungeons.forEach((d) => {
    assert.ok(hasPt(d.name), d.id);
    if (d.rank) assert.ok(ranks.has(d.rank), `${d.id}: rank ${d.rank}`);
    (d.monsters || []).forEach((id) => assert.ok(monsterIds.has(id), `${d.id}: monstro ${id}`));
  });
});

test('reinos e atualizações têm texto em português', () => {
  kingdoms.forEach((k) => assert.ok(hasPt(k.name), k.id));
  updates.forEach((u) => {
    assert.ok(hasPt(u.title), u.version);
    u.changes.forEach((c) => assert.ok(hasPt(c), u.version));
  });
});
