// Página inicial: brasas do banner e faixa "Os Reinos".
// Os reinos vêm de data/reinos.json; cada card abre o reino no Guia (guia.html#reino-<id>).
(() => {
    const i18n = () => window.SiteI18n;
    const t = (key, fallback) => i18n()?.t(key, fallback) ?? fallback;
    const txt = (field) => i18n()?.text(field) ?? (field?.pt ?? String(field ?? ''));
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---------- Brasas subindo no banner ----------
    const embers = document.querySelector('.embers');
    if (embers && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const count = window.innerWidth < 640 ? 14 : 28;
        embers.innerHTML = Array.from({ length: count }, () => {
            const style = [
                `--x:${(Math.random() * 100).toFixed(1)}%`,
                `--size:${(2 + Math.random() * 3).toFixed(1)}px`,
                `--drift:${(Math.random() * 80 - 40).toFixed(0)}px`,
                `--dur:${(7 + Math.random() * 8).toFixed(1)}s`,
                `--delay:${(-Math.random() * 15).toFixed(1)}s`
            ].join(';');
            return `<span style="${style}"></span>`;
        }).join('');
    }

    // ---------- Brasões dos reinos ----------
    // Desenhos e cores ficam em js/crests.js (compartilhado com o perfil).
    const crests = window.SiteCrests;
    const crestColor = (id) => (crests.KINGDOMS[id] || crests.DEFAULT).color;
    const crest = (id) => crests.kingdom(id);

    // ---------- Cards ----------
    const grid = document.querySelector('.kingdom-grid');
    let kingdoms = [];

    function card(kingdom) {
        // Linha principal: o herói da lenda; sem herói, quem governa (Aurelis, Malakar).
        const [label, value] = txt(kingdom.hero)
            ? [t('legendaryHero', 'Legendary hero'), txt(kingdom.hero)]
            : [t('ruler', 'Ruler'), txt(kingdom.ruler)];
        return `
            <a class="kingdom-card${kingdom.enemy ? ' is-enemy' : ''}" href="guia.html#reino-${encodeURIComponent(kingdom.id)}" style="--crest:${crestColor(kingdom.id)}">
                ${kingdom.enemy ? `<span class="kingdom-tag">${esc(t('enemyKingdom', 'Enemy kingdom'))}</span>` : ''}
                ${crest(kingdom.id)}
                <h3>${esc(txt(kingdom.name))}</h3>
                ${txt(kingdom.title) ? `<p class="kingdom-motto">${esc(txt(kingdom.title))}</p>` : ''}
                <dl class="kingdom-facts">
                    ${kingdom.capital ? `<div><dt>${esc(t('capital', 'Capital'))}</dt><dd>${esc(txt(kingdom.capital))}</dd></div>` : ''}
                    ${value ? `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>` : ''}
                </dl>
                <span class="kingdom-more">${esc(t('readKingdom', 'Read the story'))} <span aria-hidden="true">→</span></span>
            </a>`;
    }

    function render() {
        if (!grid || !kingdoms.length) return;
        // Aliados primeiro, o reino inimigo por último.
        const ordered = kingdoms.filter((k) => !k.enemy).concat(kingdoms.filter((k) => k.enemy));
        grid.innerHTML = ordered.map(card).join('');
    }

    async function load() {
        if (!grid) return;
        try {
            const response = await fetch('data/reinos.json', { cache: 'no-cache' });
            if (!response.ok) throw new Error(response.status);
            const data = await response.json();
            kingdoms = Array.isArray(data) ? data : (data.kingdoms || []);
            render();
        } catch (error) {
            console.error('Erro ao carregar os reinos:', error);
            grid.innerHTML = `<p class="update-empty">${esc(t('loadError', 'Could not load the data.'))}</p>`;
        }
    }

    // ---------- Últimas atualizações, agrupadas por mês ----------
    // Só os títulos dos últimos MONTHS meses; a lista completa fica em updates.html.
    const MONTHS = 5;
    const monthsBox = document.querySelector('.update-months');
    let updates = [];

    function monthGroups() {
        const groups = new Map();
        updates
            .filter((update) => /^\d{4}-\d{2}/.test(update.date || ''))
            .sort((a, b) => String(b.date).localeCompare(String(a.date)))
            .forEach((update) => {
                const key = update.date.slice(0, 7);
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(update);
            });
        return [...groups.entries()].slice(0, MONTHS);
    }

    function monthLabel(key) {
        const date = new Date(`${key}-01T00:00:00`);
        const label = date.toLocaleDateString(i18n()?.lang === 'en' ? 'en-US' : 'pt-BR', { month: 'long', year: 'numeric' });
        return label.charAt(0).toUpperCase() + label.slice(1);
    }

    function renderUpdates() {
        if (!monthsBox || !updates.length) return;
        monthsBox.innerHTML = monthGroups().map(([key, list]) => `
            <a class="update-month" href="updates.html">
                <h3><time datetime="${esc(key)}">${esc(monthLabel(key))}</time></h3>
                <ul>
                    ${list.map((update) => `
                        <li>
                            <span class="update-month-version">v${esc(String(update.version).replace(/^v/i, ''))}</span>
                            <span class="update-month-title">${esc(txt(update.title))}</span>
                        </li>`).join('')}
                </ul>
            </a>`).join('');
    }

    async function loadUpdates() {
        if (!monthsBox) return;
        try {
            const response = await fetch('data/updates.json', { cache: 'no-cache' });
            if (!response.ok) throw new Error(response.status);
            updates = (await response.json()).updates || [];
            renderUpdates();
        } catch (error) {
            console.error('Erro ao carregar atualizações:', error);
            monthsBox.innerHTML = `<p class="update-empty">${esc(t('loadError', 'Could not load the data.'))}</p>`;
        }
    }

    document.addEventListener('site-language-changed', () => {
        render();
        renderUpdates();
    });
    const start = () => {
        load();
        loadUpdates();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
