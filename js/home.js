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
    // Cor e símbolo de cada reino. Reino novo sem brasão aqui usa o padrão (estrela).
    const CRESTS = {
        thalor: { color: '#a9b8c9', icon: '<path d="M32 6 L39 20 L34.5 20 L34.5 56 L29.5 56 L29.5 20 L25 20 Z" fill="currentColor"/><path d="M22 26 H42" />' },
        aurelis: { color: '#d9b452', icon: '<path d="M32 10 V40"/><path d="M33 13 L48 36 H33 Z" fill="currentColor" stroke="none"/><path d="M12 42 H52 L45 52 H19 Z" fill="currentColor" stroke="none"/>' },
        sylvanor: { color: '#7fae62', icon: '<circle cx="32" cy="24" r="14"/><path d="M32 56 V30 M32 40 L22 30 M32 35 L42 25"/>' },
        dracoria: { color: '#e0612b', icon: '<path d="M32 6 C41 19 49 26 45 40 C43 50 37 55 32 57 C27 55 21 50 19 40 C17 30 25 25 27 17 C29 23 33 25 34 30 C38 24 35 15 32 6 Z" fill="currentColor" stroke="none"/>' },
        ventharis: { color: '#79b9c6', icon: '<path d="M12 52 L52 12 M52 12 L41 14 M52 12 L50 23 M16 48 L10 42 M16 48 L22 54"/><path d="M18 22 Q28 16 36 22 M12 32 Q22 26 30 32"/>' },
        malakar: { color: '#c0392b', icon: '<path d="M20 28 C11 20 13 10 19 6 C19 14 22 20 27 23 M44 28 C53 20 51 10 45 6 C45 14 42 20 37 23"/><path d="M21 28 Q32 16 43 28 V42 L38 47 H26 L21 42 Z" fill="currentColor" stroke="none"/><path d="M26 33 L30 36 M38 33 L34 36" stroke="#0c0b0a" stroke-width="3"/>' }
    };
    const DEFAULT_CREST = { color: '#d9a441', icon: '<path d="M32 10 L38 26 L54 26 L41 36 L46 52 L32 42 L18 52 L23 36 L10 26 L26 26 Z" fill="currentColor" stroke="none"/>' };

    function crest(id) {
        const { color, icon } = CRESTS[id] || DEFAULT_CREST;
        return `
            <svg class="crest" viewBox="0 0 80 96" style="--crest:${color}" aria-hidden="true" focusable="false">
                <path class="crest-shield" d="M8 6 H72 V44 C72 70 54 84 40 92 C26 84 8 70 8 44 Z"/>
                <path class="crest-inner" d="M14 12 H66 V44 C66 66 51 78 40 85 C29 78 14 66 14 44 Z"/>
                <g transform="translate(8 12)" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color:${color}">${icon}</g>
            </svg>`;
    }

    // ---------- Cards ----------
    const grid = document.querySelector('.kingdom-grid');
    let kingdoms = [];

    function card(kingdom) {
        // Linha principal: o herói da lenda; sem herói, quem governa (Aurelis, Malakar).
        const [label, value] = txt(kingdom.hero)
            ? [t('legendaryHero', 'Legendary hero'), txt(kingdom.hero)]
            : [t('ruler', 'Ruler'), txt(kingdom.ruler)];
        return `
            <a class="kingdom-card${kingdom.enemy ? ' is-enemy' : ''}" href="guia.html#reino-${encodeURIComponent(kingdom.id)}" style="--crest:${(CRESTS[kingdom.id] || DEFAULT_CREST).color}">
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
