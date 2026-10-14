// Confere se as páginas usam o header/footer compartilhados (js/layout.js) e se os links internos existem.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const sitePages = ['index.html', 'bestiario.html', 'classes.html', 'guia.html', 'updates.html', 'sobre.html'];

test('as páginas usam o header e o footer de js/layout.js, carregado antes do langSwitcher', () => {
  sitePages.forEach((page) => {
    const html = read(page);
    assert.ok(html.includes('<div id="site-header"></div>'), `${page}: sem #site-header`);
    assert.ok(html.includes('<div id="site-footer"></div>'), `${page}: sem #site-footer`);
    const layout = html.indexOf('js/layout.js');
    const lang = html.indexOf('js/langSwitcher.js');
    assert.ok(layout > html.indexOf('id="site-footer"'), `${page}: layout.js precisa vir depois dos marcadores`);
    assert.ok(layout >= 0 && layout < lang, `${page}: layout.js precisa vir antes do langSwitcher.js`);
  });
});

test('os links internos do menu, do rodapé e das páginas apontam para arquivos que existem', () => {
  const sources = [...sitePages, 'js/layout.js'];
  sources.forEach((file) => {
    const hrefs = [...read(file).matchAll(/href[=:]\s*["']([^"'#]+\.html)/g)].map((m) => m[1]);
    hrefs.forEach((href) => assert.ok(fs.existsSync(path.join(root, href)), `${file} → ${href}`));
  });
});
