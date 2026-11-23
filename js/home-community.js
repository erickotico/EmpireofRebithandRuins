// Página inicial: bloco "Da comunidade" com as últimas publicações e as perguntas sem solução.
// Só leitura, sem carregar a biblioteca do Supabase (consulta simples com a chave pública).
// Se não houver publicações (ou sem internet), o bloco continua escondido.
(function () {
    const section = document.getElementById('homeCommunity');
    if (!section || window.location.protocol === 'file:') return;
    const SUPABASE_URL = 'https://qjpogjpmxbpuuclpdfhv.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_mYKOcjU5XYwsDQW-4Bve8g_SpCqp1Dc';
    const t = (key, fallback) => (window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback);
    const crests = window.SiteCrests;

    async function feed(args) {
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/feed`, {
                method: 'POST',
                headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(args)
            });
            return res.ok ? await res.json() : [];
        } catch {
            return [];
        }
    }

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function pic(p) {
        const span = el('span', 'player-pic');
        if (crests && p.avatar && crests.find(p.avatar)) {
            span.innerHTML = crests.avatar(p.avatar);
        } else {
            span.classList.add('is-initial');
            span.textContent = p.nickname.charAt(0).toUpperCase();
        }
        return span;
    }

    const TAGS = { geral: ['tagGeneral', 'General'], pergunta: ['tagQuestion', 'Question'], dica: ['tagTip', 'Tip'], arte: ['tagArt', 'Art & screenshots'], anuncio: ['tagNews', 'Announcement'] };

    function item(p) {
        const li = el('li');
        const a = el('a', 'hc-item');
        a.href = `${p.tag === 'pergunta' || p.tag === 'dica' ? 'taverna' : 'social'}.html?post=${p.id}`;
        const top = el('span', 'hc-top');
        top.append(pic(p), el('strong', 'hc-name', p.nickname), el('span', `hc-tag tag-${p.tag}`, t(...(TAGS[p.tag] || TAGS.geral))));
        const text = el('span', 'hc-text', p.body || `📷 ${t('tagArt', 'Art & screenshots')}`);
        const stats = el('span', 'hc-stats', `♥ ${p.like_count}   💬 ${p.comment_count}`);
        a.append(top, text, stats);
        li.appendChild(a);
        return li;
    }

    let data = null;
    function render() {
        if (!data) return;
        const [latest, open] = data;
        const fill = (id, rows, emptyKey, emptyText) => {
            const ul = document.getElementById(id);
            ul.textContent = '';
            if (!rows.length) ul.appendChild(el('li', 'hc-empty', t(emptyKey, emptyText)));
            rows.forEach((p) => ul.appendChild(item(p)));
        };
        fill('hcLatest', latest, 'communityEmpty', 'No posts yet. Be the first!');
        fill('hcOpen', open, 'noUnsolved', 'No open questions. Everyone got help!');
        section.hidden = !latest.length && !open.length;
    }

    Promise.all([
        feed({ p_limit: 4, p_tags: ['geral', 'arte', 'anuncio'] }),
        feed({ p_limit: 4, p_unsolved: true })
    ]).then(([latest, open]) => {
        // As 3 mais recentes por data (as fixadas não furam a fila aqui)
        data = [latest.slice().sort((x, y) => y.id - x.id).slice(0, 3), open.slice(0, 3)];
        render();
    });
    document.addEventListener('site-language-changed', render);
})();
