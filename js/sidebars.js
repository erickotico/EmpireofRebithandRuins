// Laterais do Social e da Taverna (estilo rede social).
//   Esquerda: você (foto, apelido, atalhos) e seus amigos — ou convite para entrar.
//   Direita (Social):  "Em alta" + perguntas esperando ajuda na Taverna.
//   Direita (Taverna): maiores ajudantes + dicas mais curtidas + como funciona.
// Tudo que vem do banco entra como TEXTO.
document.addEventListener('DOMContentLoaded', async () => {
    const feedApi = window.EorFeed;
    const auth = window.EorAuth;
    const left = document.getElementById('sideLeft');
    const right = document.getElementById('sideRight');
    const main = document.querySelector('[data-area]');
    if (!feedApi || !auth || !left || !right || !main) return;
    const { client } = auth;
    const t = (key, fallback) => (window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback);
    const area = main.dataset.area === 'taverna' ? 'taverna' : 'social';

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function card(titleKey, titleText) {
        const box = el('section', 'side-card');
        if (titleKey) box.appendChild(el('h2', 'side-title', t(titleKey, titleText)));
        return box;
    }
    const icon = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
    const profileUrl = (nick) => `perfil.html?n=${encodeURIComponent(nick)}`;

    // Lista de publicações em miniatura (Em alta / Dicas / Perguntas)
    function miniList(rows, emptyKey, emptyText) {
        const ul = el('ul', 'side-posts');
        if (!rows.length) ul.appendChild(el('li', 'side-empty', t(emptyKey, emptyText)));
        rows.forEach((p) => {
            const li = el('li');
            const a = el('a', 'side-post');
            a.href = feedApi.postUrl(p.id, p.tag);
            const who = el('span', 'side-post-who');
            who.append(feedApi.picFor(p), el('strong', '', p.nickname));
            const text = el('span', 'side-post-text', p.body || `📷 ${t('tagArt', 'Art & screenshots')}`);
            const stats = el('span', 'side-post-stats', `♥ ${p.like_count}   💬 ${p.comment_count}`);
            a.append(who, text, stats);
            li.appendChild(a);
            ul.appendChild(li);
        });
        return ul;
    }
    // As mais populares entre as recentes (curtidas valem mais que comentários)
    const popular = (rows, n) => rows
        .filter((p) => p.like_count + p.comment_count > 0)
        .sort((a, b) => (b.like_count * 2 + b.comment_count) - (a.like_count * 2 + a.comment_count) || b.id - a.id)
        .slice(0, n);

    // ---------- esquerda ----------
    async function renderLeft() {
        left.textContent = '';
        const viewer = await feedApi.ready();
        if (!viewer.me || viewer.needMfa) {
            const box = card();
            box.classList.add('side-welcome');
            box.append(
                el('h2', 'side-welcome-title', t('joinAdventurers', 'Join the adventurers')),
                el('p', '', t('joinAdventurersText', 'Create your account to post, ask in the Tavern, make friends and chat.'))
            );
            const enter = el('a', 'btn btn-download', t('login', 'Login'));
            enter.href = 'login.html';
            box.appendChild(enter);
            left.appendChild(box);
            return;
        }
        const me = viewer.profile || { nickname: viewer.me.user_metadata?.nickname || '?', avatar: null };

        const meCard = card();
        meCard.classList.add('side-me');
        const who = el('a', 'side-me-who');
        who.href = 'perfil.html';
        who.append(feedApi.picFor(me), el('span', 'side-me-name', me.nickname));
        const seeProfile = el('span', 'side-me-link', t('viewMyProfile', 'View my profile'));
        who.querySelector('.side-me-name').appendChild(seeProfile);
        meCard.appendChild(who);
        // Meu status (online / ocupado / não perturbe / oculto)
        if (typeof me.presence_mode === 'string') {
            const status = auth.presence.picker(me.presence_mode, (saved) => { if (saved) me.presence_mode = saved; });
            status.classList.add('is-compact');
            meCard.appendChild(status);
        }

        const nav = el('nav', 'side-nav');
        nav.setAttribute('aria-label', t('quickMenu', 'Quick menu'));
        [
            ['social.html', 'socialPageTitle', 'Social', 'M4 6 H20 V18 H4 Z M4 15 L9 10 L13 14 L15 12 L20 17'],
            ['taverna.html', 'tavernPageTitle', 'Tavern', 'M5 4 H19 L17 12 H7 Z M12 12 V18 M8 20 H16'],
            ['amigos.html', 'friendsTitle', 'Friends', 'M9 11 A3.5 3.5 0 1 0 9 4 A3.5 3.5 0 1 0 9 11 Z M2.5 20 C3 15.5 6 14 9 14 C12 14 15 15.5 15.5 20 M16 4.5 A3 3 0 0 1 16 10.5 M18 14.5 C20 15.2 21.3 17 21.5 20'],
            ['mensagens.html', 'messagesPageTitle', 'Messages', 'M3 6 H21 V18 H3 Z M3 6 L12 13 L21 6']
        ].forEach(([href, key, label, d]) => {
            const a = el('a');
            a.href = href;
            if (window.location.pathname.endsWith(href)) a.setAttribute('aria-current', 'page');
            a.innerHTML = icon(d);
            a.appendChild(el('span', '', t(key, label)));
            nav.appendChild(a);
        });
        meCard.appendChild(nav);
        left.appendChild(meCard);

        // Amigos (até 8)
        const [{ data }, online] = await Promise.all([client.rpc('my_friendships'), auth.presence.friends()]);
        const status = (f) => online.get(f.nickname.toLowerCase());
        // online primeiro, depois quem foi visto por último mais recentemente
        const friends = (data || []).filter((r) => r.kind === 'friend').sort((a, b) =>
            (auth.presence.active(status(b)) ? 1 : 0) - (auth.presence.active(status(a)) ? 1 : 0)
            || new Date(status(b)?.seen_at || 0) - new Date(status(a)?.seen_at || 0));
        const fCard = card('friendsTitle', 'Friends');
        if (!friends.length) {
            const p = el('p', 'side-empty', t('noFriendsSide', 'No friends yet.'));
            fCard.appendChild(p);
        } else {
            const ul = el('ul', 'side-friends');
            friends.slice(0, 8).forEach((f) => {
                const li = el('li');
                const a = el('a', 'side-friend');
                a.href = profileUrl(f.nickname);
                const pic = feedApi.picFor(f);
                auth.presence.mark(pic, status(f));
                const label = el('span', 'side-friend-name');
                label.append(el('span', '', f.nickname));
                const seen = auth.presence.text(status(f));
                if (seen) label.appendChild(el('small', auth.presence.textClass(status(f)), seen));
                a.append(pic, label);
                const chat = el('a', 'side-friend-chat');
                chat.href = `mensagens.html?com=${encodeURIComponent(f.nickname)}`;
                chat.setAttribute('aria-label', `${t('sendMessage', 'Send message')}: ${f.nickname}`);
                chat.title = t('sendMessage', 'Send message');
                chat.innerHTML = icon('M3 6 H21 V18 H3 Z M3 6 L12 13 L21 6');
                li.append(a, chat);
                ul.appendChild(li);
            });
            fCard.appendChild(ul);
        }
        const all = el('a', 'side-more', friends.length > 8 ? `${t('seeAll', 'See all')} (${friends.length})` : t('manageFriends', 'Manage friends'));
        all.href = 'amigos.html';
        fCard.appendChild(all);
        left.appendChild(fCard);
    }

    // ---------- direita ----------
    async function feed(args) {
        const { data } = await client.rpc('feed', args);
        return (data || []).filter((p) => !p.removed);   // sem "Publicação removida" nas listas
    }

    async function renderRight() {
        right.textContent = '';
        if (area === 'social') {
            const [recent, open] = await Promise.all([
                feed({ p_limit: 40, p_tags: feedApi.AREAS.social }),
                feed({ p_limit: 3, p_unsolved: true })
            ]);
            const hot = card('trendingTitle', 'Trending');
            hot.appendChild(miniList(popular(recent, 4), 'trendingEmpty', 'Like and comment to bring posts here.'));
            right.appendChild(hot);

            const help = card('openQuestionsShort', 'Questions waiting for help');
            help.appendChild(miniList(open, 'noUnsolved', 'No open questions. Everyone got help!'));
            const go = el('a', 'side-more', t('helpAPlayer', 'Help a player'));
            go.href = 'taverna.html?filtro=sem-solucao';
            help.appendChild(go);
            right.appendChild(help);
        } else {
            const [{ data: helpers }, tips] = await Promise.all([
                client.rpc('top_helpers', { p_limit: 5 }),
                feed({ p_limit: 40, p_tag: 'dica' })
            ]);
            const top = card('topHelpers', 'Top helpers');
            const ol = el('ol', 'side-helpers');
            (helpers || []).forEach((h, i) => {
                const li = el('li');
                const a = el('a', 'side-helper');
                a.href = profileUrl(h.nickname);
                a.append(el('span', `side-rank rank-${i + 1}`, String(i + 1)), feedApi.picFor(h), el('span', 'side-helper-name', h.nickname));
                const count = el('span', 'side-helper-count', String(h.best_answers));
                count.title = t('bestAnswersCount', 'Best answers');
                a.appendChild(count);
                li.appendChild(a);
                ol.appendChild(li);
            });
            if (!(helpers || []).length) top.appendChild(el('p', 'side-empty', t('topHelpersEmpty', 'Nobody yet. Answer a question and be the first!')));
            else top.appendChild(ol);
            right.appendChild(top);

            const best = card('popularTips', 'Most liked tips');
            best.appendChild(miniList(popular(tips, 3), 'popularTipsEmpty', 'No popular tips yet.'));
            right.appendChild(best);

            const how = card('howTavernWorks', 'How the Tavern works');
            const steps = el('ol', 'side-steps');
            [
                ['howStep1', 'Ask your question with the "Question" topic.'],
                ['howStep2', 'Other players answer in the comments.'],
                ['howStep3', 'Mark the answer that solved it as the best one.'],
                ['howStep4', 'Helpers earn badges: Helper (3) and Tavern Sage (15).']
            ].forEach(([key, text]) => steps.appendChild(el('li', '', t(key, text))));
            how.appendChild(steps);
            right.appendChild(how);
        }
        const rules = el('a', 'side-rules', t('communityRules', 'Community rules'));
        rules.href = 'termos.html#regras';
        right.appendChild(rules);
    }

    await Promise.all([renderLeft(), renderRight()]);
    document.addEventListener('site-language-changed', () => { renderLeft(); renderRight(); });
});
