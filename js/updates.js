// Página de atualizações: versões agrupadas por mês numa linha do tempo.
// Cada mês começa fechado; clicar abre e mostra as atualizações completas daquele mês.
// Dados: data/updates.json com título e mudanças nos dois idiomas.
(() => {
    const container = document.querySelector('.updates-grid');
    if (!container) return;
    const searchInput = document.getElementById('search-updates');

    const i18n = () => window.SiteI18n;
    const t = (key, fallback) => i18n()?.t(key, fallback) ?? fallback;
    const txt = (field) => i18n()?.text(field) ?? (field?.pt ?? String(field ?? ''));
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const locale = () => (i18n()?.lang === 'en' ? 'en-US' : 'pt-BR');

    let updates = [];
    const openMonths = new Set(); // meses que o jogador abriu (sobrevive à troca de idioma)

    const version = (update) => `v${String(update.version).replace(/^v/i, '')}`;

    function formatDate(dateString) {
        const date = new Date(`${dateString}T00:00:00`);
        if (Number.isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString(locale());
    }

    function monthLabel(key) {
        const date = new Date(`${key}-01T00:00:00`);
        if (Number.isNaN(date.getTime())) return key;
        const label = date.toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
        return label.charAt(0).toUpperCase() + label.slice(1);
    }

    function createCard(update) {
        return `
            <article class="update-card">
                <div class="update-header">
                    <span class="update-version">${esc(version(update))}</span>
                    <time class="update-date" datetime="${esc(update.date)}">${esc(formatDate(update.date))}</time>
                </div>
                <h3>${esc(txt(update.title))}</h3>
                <ul class="update-list">
                    ${(update.changes || []).map((change) => `<li>${esc(txt(change))}</li>`).join('')}
                </ul>
                ${update.link ? `<a href="${esc(update.link)}" class="update-link" target="_blank" rel="noopener">${esc(t('updateDetails', 'View full details'))}</a>` : ''}
            </article>
        `;
    }

    function matches(update, term) {
        return !term
            || String(update.version).toLowerCase().includes(term)
            || [update.title?.pt, update.title?.en, ...(update.changes || []).flatMap((c) => [c?.pt, c?.en])]
                .some((value) => String(value || '').toLowerCase().includes(term));
    }

    function groupByMonth(list) {
        const groups = new Map();
        list
            .slice()
            .sort((a, b) => String(b.date).localeCompare(String(a.date)))
            .forEach((update) => {
                const key = String(update.date || '').slice(0, 7) || '—';
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(update);
            });
        return [...groups.entries()];
    }

    function render() {
        const term = (searchInput?.value || '').trim().toLowerCase();
        const groups = groupByMonth(updates.filter((update) => matches(update, term)));
        if (!groups.length) {
            container.innerHTML = `<p class="update-empty">${esc(t('noResults', 'Nothing found.'))}</p>`;
            return;
        }
        container.innerHTML = groups.map(([key, list], index) => {
            // na busca, os meses com resultado abrem sozinhos
            const open = term || openMonths.has(key);
            return `
                <details class="update-month-group${index === 0 ? ' is-latest' : ''}" data-month="${esc(key)}"${open ? ' open' : ''}>
                    <summary>
                        <span class="month-name"><time datetime="${esc(key)}">${esc(monthLabel(key))}</time></span>
                        <span class="month-versions">${list.map((update) => esc(version(update))).join(' · ')}</span>
                        <span class="month-chevron" aria-hidden="true"></span>
                    </summary>
                    <div class="month-body">${list.map(createCard).join('')}</div>
                </details>`;
        }).join('');
    }

    // Guarda quais meses o jogador abriu/fechou (fora da busca).
    container.addEventListener('toggle', (event) => {
        const group = event.target.closest?.('.update-month-group');
        if (!group || (searchInput?.value || '').trim()) return;
        if (group.open) openMonths.add(group.dataset.month);
        else openMonths.delete(group.dataset.month);
    }, true);

    async function load() {
        try {
            const response = await fetch('data/updates.json', { cache: 'no-cache' });
            if (!response.ok) throw new Error(response.status);
            const data = await response.json();
            updates = data.updates || [];
            render();
        } catch (error) {
            console.error('Erro ao carregar atualizações:', error);
            container.innerHTML = `<p class="update-empty">${esc(t('loadError', 'Could not load the data.'))}</p>`;
        }
    }

    searchInput?.addEventListener('input', render);
    document.addEventListener('site-language-changed', render);

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
    else load();
})();
