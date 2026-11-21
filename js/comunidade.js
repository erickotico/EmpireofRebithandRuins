// Página Comunidade: escrever, filtrar por etiqueta e ler o feed (js/feed.js faz o trabalho).
//   comunidade.html            → feed geral
//   comunidade.html?post=123   → uma publicação, com os comentários abertos
document.addEventListener('DOMContentLoaded', () => {
    const feedApi = window.EorFeed;
    const t = (key, fallback) => (window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback);
    const $ = (id) => document.getElementById(id);
    if (!feedApi) {
        $('feed').textContent = t('errNetwork', 'Connection failed. Check your internet and try again.');
        return;
    }

    const postId = Number(new URLSearchParams(window.location.search).get('post'));
    if (Number.isInteger(postId) && postId > 0) {
        $('communityBack').hidden = false;
        $('feedFilters').hidden = true;
        feedApi.list($('feed'), { post: postId });
        return;
    }

    const list = feedApi.list($('feed'), { emptyText: t('communityEmpty', 'No posts yet. Be the first!') });
    feedApi.composer($('composer'), (id) => list.prepend(id));

    // Filtros: Tudo + etiquetas
    const filters = $('feedFilters');
    const options = [{ id: '', key: 'tagAll', label: 'All' }, ...feedApi.TAGS];
    function renderFilters(active) {
        filters.textContent = '';
        options.forEach((o) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `tag-chip${o.id ? ` tag-${o.id}` : ''}`;
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-selected', String(o.id === active));
            b.textContent = t(o.key, o.label);
            b.addEventListener('click', () => {
                if (o.id === current) return;
                current = o.id;
                renderFilters(current);
                list.setTag(current);
            });
            filters.appendChild(b);
        });
    }
    let current = '';
    renderFilters(current);
    document.addEventListener('site-language-changed', () => { renderFilters(current); list.reload(); });
});
