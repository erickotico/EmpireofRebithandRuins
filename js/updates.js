// Lista de atualizações (página inicial e página de atualizações).
// Dados: data/updates.json com título e mudanças nos dois idiomas.
(() => {
    const container = document.querySelector('.updates-grid');
    if (!container) return;
    const searchInput = document.getElementById('search-updates');

    const i18n = () => window.SiteI18n;
    const t = (key, fallback) => i18n()?.t(key, fallback) ?? fallback;
    const txt = (field) => i18n()?.text(field) ?? (field?.pt ?? String(field ?? ''));
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    let updates = [];

    function formatDate(dateString) {
        const date = new Date(`${dateString}T00:00:00`);
        if (Number.isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString(i18n()?.lang === 'en' ? 'en-US' : 'pt-BR');
    }

    function createCard(update) {
        return `
            <article class="update-card">
                <div class="update-header">
                    <span class="update-version">v${esc(String(update.version).replace(/^v/i, ''))}</span>
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

    function render() {
        const term = (searchInput?.value || '').trim().toLowerCase();
        const list = updates.filter((update) => !term
            || String(update.version).toLowerCase().includes(term)
            || [update.title?.pt, update.title?.en, ...(update.changes || []).flatMap((c) => [c?.pt, c?.en])]
                .some((value) => String(value || '').toLowerCase().includes(term)));
        container.innerHTML = list.length
            ? list.map(createCard).join('')
            : `<p class="update-empty">${esc(t('noResults', 'Nothing found.'))}</p>`;
    }

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
