// Páginas Social e Taverna (o <main> diz qual é: data-area="social" ou "taverna").
//   Social  → momentos do jogo, prints e anúncios (etiquetas: geral, arte, anuncio)
//   Taverna → perguntas e dicas, com melhor resposta e "Sem solução" (etiquetas: pergunta, dica)
//   ?q=texto                → busca (publicações da área + jogadores)
//   ?filtro=sem-solucao     → (Taverna) perguntas sem melhor resposta
//   ?post=123               → uma publicação, com os comentários abertos
document.addEventListener('DOMContentLoaded', () => {
    const feedApi = window.EorFeed;
    const t = (key, fallback) => (window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback);
    const $ = (id) => document.getElementById(id);
    const main = document.querySelector('[data-area]');
    if (!feedApi || !main) {
        $('feed').textContent = t('errNetwork', 'Connection failed. Check your internet and try again.');
        return;
    }
    const area = main.dataset.area === 'taverna' ? 'taverna' : 'social';
    const AREA = {
        social: {
            tags: feedApi.AREAS.social,
            filters: [['', 'tagAll', 'All'], ['geral', 'tagGeneral', 'General'], ['arte', 'tagArt', 'Art & screenshots'], ['anuncio', 'tagNews', 'Announcement']],
            placeholder: ['socialPlaceholder', 'Share a moment from your adventure or a screenshot...'],
            empty: ['socialEmpty', 'No posts yet. Share the first moment!']
        },
        taverna: {
            tags: feedApi.AREAS.taverna,
            filters: [['', 'tagAll', 'All'], ['pergunta', 'tagQuestion', 'Question'], ['unsolved', 'filterUnsolved', 'Unanswered'], ['dica', 'tagTip', 'Tip']],
            placeholder: ['tavernPlaceholder', 'What is your question? Or share a tip with other adventurers...'],
            empty: ['tavernEmpty', 'No questions yet. Ask the first one!']
        }
    }[area];
    const params = new URLSearchParams(window.location.search);

    const postId = Number(params.get('post'));
    if (Number.isInteger(postId) && postId > 0) {
        $('communityBack').hidden = false;
        $('feedFilters').hidden = true;
        $('feedSearch').hidden = true;
        feedApi.list($('feed'), { post: postId });
        return;
    }

    const state = {
        tag: '',
        unsolved: area === 'taverna' && params.get('filtro') === 'sem-solucao',
        query: (params.get('q') || '').trim().slice(0, 60)
    };
    if (state.query.length < 2) state.query = '';

    const list = feedApi.list($('feed'), { tags: AREA.tags, emptyText: t(...AREA.empty) });
    if (state.query || state.unsolved) list.setFilter(state);
    feedApi.composer($('composer'), (id) => {
        if (state.query || state.unsolved || state.tag) apply({ tag: '', unsolved: false, query: '' });
        else list.prepend(id);
    }, { tags: AREA.tags, placeholder: AREA.placeholder });

    function syncUrl() {
        const q = new URLSearchParams();
        if (state.query) q.set('q', state.query);
        if (state.unsolved) q.set('filtro', 'sem-solucao');
        const s = q.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${s ? `?${s}` : ''}`);
    }

    function apply(next) {
        Object.assign(state, next);
        list.setFilter(state);
        renderFilters();
        renderSearch();
        syncUrl();
    }

    // ---------- filtros ----------
    const filters = $('feedFilters');
    function renderFilters() {
        filters.textContent = '';
        const active = state.unsolved ? 'unsolved' : state.tag;
        AREA.filters.forEach(([id, key, label]) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = `tag-chip${id ? ` tag-${id}` : ''}`;
            b.setAttribute('role', 'tab');
            b.setAttribute('aria-selected', String(!state.query && id === active));
            b.textContent = t(key, label);
            b.addEventListener('click', () => {
                $('searchInput').value = '';
                if (id === 'unsolved') apply({ tag: '', unsolved: true, query: '' });
                else apply({ tag: id, unsolved: false, query: '' });
            });
            filters.appendChild(b);
        });
    }

    // ---------- busca ----------
    const input = $('searchInput');
    input.value = state.query;
    const placeholder = () => (area === 'taverna'
        ? t('searchTavernPlaceholder', 'Search questions, tips or players...')
        : t('searchPlaceholder', 'Search posts or players...'));
    input.placeholder = placeholder();

    async function renderSearch() {
        $('searchClear').hidden = !input.value;
        const summary = $('searchSummary');
        const players = $('searchPlayers');
        if (!state.query) {
            summary.hidden = true;
            players.hidden = true;
            return;
        }
        summary.hidden = false;
        summary.textContent = `${t('searchResultsFor', 'Results for')} “${state.query}”`;
        const { data } = await window.EorAuth.client.rpc('search_players', { p_query: state.query, p_limit: 8 });
        if (state.query !== input.value.trim()) return;
        const ul = $('searchPlayerList');
        ul.textContent = '';
        (data || []).forEach((p) => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.className = 'search-player';
            a.href = `perfil.html?n=${encodeURIComponent(p.nickname)}`;
            const name = document.createElement('span');
            name.textContent = p.nickname;
            a.append(feedApi.picFor(p), name);
            li.appendChild(a);
            ul.appendChild(li);
        });
        players.hidden = !(data || []).length;
    }

    let typing = null;
    function search() {
        const q = input.value.trim().slice(0, 60);
        if (q.length === 1 || q === state.query) return;
        apply({ tag: '', unsolved: false, query: q });
    }
    input.addEventListener('input', () => {
        $('searchClear').hidden = !input.value;
        clearTimeout(typing);
        typing = setTimeout(search, 450);
    });
    $('feedSearch').addEventListener('submit', (e) => {
        e.preventDefault();
        clearTimeout(typing);
        search();
    });
    $('searchClear').addEventListener('click', () => {
        input.value = '';
        apply({ query: '' });
        input.focus();
    });

    renderFilters();
    renderSearch();
    document.addEventListener('site-language-changed', () => {
        input.placeholder = placeholder();
        renderFilters();
        renderSearch();
        list.reload();
    });
});
