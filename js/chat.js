// Janelinha de mensagens no canto da tela (estilo Facebook), em todas as páginas.
// Carregada pelo layout.js só quando o jogador está logado.
//   - o envelope do topo (ou "Mensagens" no menu ☰) abre/fecha a janela;
//   - qualquer link "mensagens.html?com=Apelido" abre a conversa direto na janela;
//   - a janela lembra se estava aberta e em qual conversa ao trocar de página.
// Regras (só amigos, bloqueio, limites, 1 ano) ficam no banco: supabase/007_mensagens.sql.
// Tudo que vem do banco entra como TEXTO (textContent), nunca como HTML.
(async function () {
    if (window.EorChat) return;
    const auth = window.EorAuth;
    const crests = window.SiteCrests;
    if (!auth || !crests) return;
    const { client } = auth;
    const t = (key, fallback) => (window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback);
    const lang = () => (window.SiteI18n?.lang === 'pt' ? 'pt-BR' : 'en');

    const { data: { session } } = await client.auth.getSession();
    if (!session) return;
    const me = session.user;
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') return;

    // ---------- estado lembrado entre páginas ----------
    const STATE_KEY = 'eor-chat';
    let saved = {};
    try { saved = JSON.parse(sessionStorage.getItem(STATE_KEY)) || {}; } catch { /* */ }
    const state = { open: !!saved.open, min: !!saved.min, nick: auth.NICK_RE.test(saved.nick || '') ? saved.nick : null };
    function save() {
        try { sessionStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* */ }
    }

    // ---------- janela ----------
    const dock = document.createElement('section');
    dock.className = 'chat-dock';
    dock.hidden = true;
    dock.innerHTML = `
        <header class="dock-head">
            <button type="button" class="dock-icon dock-back" hidden>
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5 L8 12 L15 19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <a class="dock-who" hidden><span class="player-pic"></span><span class="dock-name"></span></a>
            <button type="button" class="dock-title"><span class="dock-title-text"></span><span class="dock-unread" hidden></span></button>
            <div class="dock-menu" hidden>
                <button type="button" class="dock-icon dock-menu-btn" aria-haspopup="true" aria-expanded="false">
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
                </button>
                <div class="dock-menu-list" hidden>
                    <a class="dock-profile-link"></a>
                    <button type="button" class="dock-block"></button>
                </div>
            </div>
            <button type="button" class="dock-icon dock-min">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 12 H18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
            <button type="button" class="dock-icon dock-close">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            </button>
        </header>
        <div class="dock-body">
            <div class="dock-list">
                <ul class="dock-convs"></ul>
                <p class="dock-section" hidden></p>
                <ul class="dock-friends"></ul>
                <p class="dock-empty" hidden></p>
            </div>
            <div class="dock-chat" hidden>
                <div class="dock-scroll">
                    <button type="button" class="dock-older" hidden></button>
                    <ol class="dock-messages" aria-live="polite"></ol>
                </div>
                <p class="dock-notice" hidden></p>
                <form class="dock-compose" novalidate>
                    <textarea rows="1" maxlength="1000"></textarea>
                    <button type="submit" class="dock-send">
                        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 12 L20 4 L14 20 L11 13 Z" fill="currentColor"/></svg>
                    </button>
                </form>
                <p class="dock-error" role="alert"></p>
            </div>
        </div>`;
    document.body.appendChild(dock);

    const q = (sel) => dock.querySelector(sel);
    const el = {
        back: q('.dock-back'), who: q('.dock-who'), name: q('.dock-name'),
        title: q('.dock-title'), titleText: q('.dock-title-text'), unread: q('.dock-unread'),
        menu: q('.dock-menu'), menuBtn: q('.dock-menu-btn'), menuList: q('.dock-menu-list'),
        profileLink: q('.dock-profile-link'), block: q('.dock-block'),
        min: q('.dock-min'), close: q('.dock-close'),
        list: q('.dock-list'), convs: q('.dock-convs'), section: q('.dock-section'),
        friends: q('.dock-friends'), empty: q('.dock-empty'),
        chat: q('.dock-chat'), scroll: q('.dock-scroll'), older: q('.dock-older'),
        messages: q('.dock-messages'), notice: q('.dock-notice'),
        form: q('.dock-compose'), input: q('.dock-compose textarea'), send: q('.dock-send'), error: q('.dock-error')
    };

    function applyTexts() {
        dock.setAttribute('aria-label', t('messagesPageTitle', 'Messages'));
        el.titleText.textContent = t('messagesPageTitle', 'Messages');
        el.back.setAttribute('aria-label', t('backToConversations', 'Back to conversations'));
        el.menuBtn.setAttribute('aria-label', t('moreOptions', 'More options'));
        el.profileLink.textContent = t('viewProfile', 'View profile');
        el.block.textContent = t('blockPlayer', 'Block player');
        el.min.setAttribute('aria-label', t('minimize', 'Minimize'));
        el.close.setAttribute('aria-label', t('close', 'Close'));
        el.section.textContent = t('friendsTitle', 'Friends');
        el.older.textContent = t('loadOlder', 'Load older messages');
        el.input.placeholder = t('typeMessage', 'Type a message');
        el.input.setAttribute('aria-label', t('typeMessage', 'Type a message'));
        el.send.setAttribute('aria-label', t('send', 'Send'));
        [el.back, el.min, el.close, el.menuBtn].forEach((b) => { b.title = b.getAttribute('aria-label'); });
    }

    // ---------- utilidades ----------
    function messageError(error) {
        const reason = String(error?.message || '').match(/EOR_[A-Z_]+/)?.[0];
        const map = {
            EOR_NOT_FRIENDS: ['errNotFriends', 'You need to be friends to talk.'],
            EOR_BLOCKED: ['errBlocked', 'You cannot send messages to this player.'],
            EOR_TOO_MANY: ['errTooManyMessages', 'Too many messages in a short time. Wait a little.'],
            EOR_TOO_LONG: ['errTooLong', 'Message too long (max. 1,000 characters).'],
            EOR_EMPTY: ['errEmptyMessage', 'Type a message.']
        };
        return map[reason] || auth.friendError(error);
    }
    function picFor(p) {
        const span = document.createElement('span');
        span.className = 'player-pic';
        if (p.avatar && crests.find(p.avatar)) {
            span.innerHTML = crests.avatar(p.avatar);
        } else {
            span.classList.add('is-initial');
            span.textContent = p.nickname.charAt(0).toUpperCase();
        }
        return span;
    }
    function when(value) {
        const d = new Date(value);
        return d.toDateString() === new Date().toDateString()
            ? d.toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit' })
            : d.toLocaleDateString(lang(), { day: 'numeric', month: 'short' });
    }
    const same = (a, b) => a.toLowerCase() === b.toLowerCase();
    const notifyHeader = () => window.dispatchEvent(new Event('eor-messages-changed'));
    const isPhone = () => window.matchMedia('(max-width: 520px)').matches;
    const watching = () => !dock.hidden && !state.min && document.visibilityState === 'visible';

    // ---------- abrir / minimizar / fechar ----------
    function render() {
        dock.hidden = !state.open;
        dock.classList.toggle('is-min', state.min);
        document.documentElement.classList.toggle('chat-dock-full', state.open && !state.min && isPhone());
        const inChat = !!current;
        el.back.hidden = !inChat || state.min;
        el.who.hidden = !inChat;
        el.title.hidden = inChat;
        el.menu.hidden = !inChat || state.min;
        el.list.hidden = inChat;
        el.chat.hidden = !inChat;
        const total = conversations.reduce((n, c) => n + (c.unread || 0), 0);
        el.unread.hidden = !total || !state.min;
        el.unread.textContent = total > 9 ? '9+' : String(total);
        el.min.setAttribute('aria-label', t(state.min ? 'expand' : 'minimize', state.min ? 'Expand' : 'Minimize'));
        el.min.title = el.min.getAttribute('aria-label');
        el.min.classList.toggle('is-up', state.min);
    }
    async function openDock() {
        state.open = true;
        state.min = false;
        save();
        render();
        if (!current) await refreshList();
        else markReadIfWatching();
    }
    function closeDock() {
        state.open = false;
        state.nick = null;
        current = null;
        save();
        render();
    }
    function toggleMin() {
        state.min = !state.min;
        save();
        render();
        if (!state.min) {
            markReadIfWatching();
            if (current) el.scroll.scrollTop = el.scroll.scrollHeight;
        }
    }
    el.min.addEventListener('click', toggleMin);
    el.title.addEventListener('click', () => { if (state.min) toggleMin(); });
    el.close.addEventListener('click', closeDock);
    dock.querySelector('.dock-head').addEventListener('click', (e) => {
        if (state.min && !e.target.closest('button, a')) toggleMin();
    });
    el.back.addEventListener('click', () => {
        current = null;
        state.nick = null;
        save();
        render();
        refreshList();
    });
    window.matchMedia('(max-width: 520px)').addEventListener('change', render);

    // ---------- lista: conversas + amigos ----------
    let conversations = [];
    let friends = [];
    let presence = new Map(); // amigos online (bolinha verde)
    let current = null; // { nickname, avatar, blocked, oldestId, newestId }

    async function loadConversations() {
        const { data, error } = await client.rpc('my_conversations');
        if (!error) conversations = data || [];
        return !error;
    }
    async function loadFriends() {
        const { data, error } = await client.rpc('my_friendships');
        if (!error) friends = (data || []).filter((r) => r.kind === 'friend');
    }
    async function refreshList() {
        const [, , online] = await Promise.all([loadConversations(), loadFriends(), auth.presence.friends()]);
        presence = online;
        renderList();
        render();
    }

    function item(p, extra) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'conv-item';
        const text = document.createElement('span');
        text.className = 'conv-text';
        const top = document.createElement('span');
        top.className = 'conv-top';
        const name = document.createElement('strong');
        name.textContent = p.nickname;
        top.appendChild(name);
        text.appendChild(top);
        const photo = picFor(p);
        auth.presence.mark(photo, presence.get(p.nickname.toLowerCase()));
        btn.append(photo, text);
        if (extra) extra(btn, top, text);
        btn.addEventListener('click', () => openChat(p.nickname, p.avatar));
        li.appendChild(btn);
        return li;
    }

    function renderList() {
        el.convs.textContent = '';
        el.friends.textContent = '';
        conversations.forEach((c) => {
            el.convs.appendChild(item(c, (btn, top, text) => {
                if (c.unread) btn.classList.add('is-unread');
                const time = document.createElement('small');
                time.textContent = when(c.last_at);
                top.appendChild(time);
                const preview = document.createElement('span');
                preview.className = 'conv-preview';
                preview.textContent = (c.last_mine ? `${t('you', 'You')}: ` : '') + c.last_body;
                text.appendChild(preview);
                if (c.unread) {
                    const badge = document.createElement('span');
                    badge.className = 'conv-unread';
                    badge.textContent = c.unread > 99 ? '99+' : String(c.unread);
                    btn.appendChild(badge);
                }
            }));
        });
        // Amigos com quem ainda não há conversa: um clique e já começa a conversar
        const others = friends.filter((f) => !conversations.some((c) => same(c.nickname, f.nickname)));
        others.forEach((f) => el.friends.appendChild(item(f)));
        el.section.hidden = !others.length || !conversations.length;
        el.empty.hidden = conversations.length > 0 || others.length > 0;
        el.empty.textContent = '';
        if (!el.empty.hidden) {
            el.empty.append(t('noFriendsToMessage', 'You have no friends yet. Add friends to send messages.'), ' ');
            const a = document.createElement('a');
            a.href = 'amigos.html';
            a.textContent = t('myFriends', 'My friends');
            el.empty.appendChild(a);
        }
    }

    // ---------- conversa ----------
    function bubble(m) {
        const li = document.createElement('li');
        li.className = `msg ${m.mine ? 'is-mine' : 'is-theirs'}`;
        const body = document.createElement('p');
        body.className = 'msg-body';
        body.textContent = m.body;
        const meta = document.createElement('span');
        meta.className = 'msg-meta';
        const time = document.createElement('time');
        time.dateTime = m.created_at;
        time.textContent = new Date(m.created_at).toLocaleString(lang(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        meta.appendChild(time);
        if (!m.mine) {
            const report = document.createElement('button');
            report.type = 'button';
            report.className = 'msg-report';
            report.textContent = t('report', 'Report');
            report.addEventListener('click', () => reportMessage(m.id, report));
            meta.appendChild(report);
        }
        li.append(body, meta);
        return li;
    }

    function setComposer(enabled, key, text) {
        el.form.hidden = !enabled;
        el.notice.hidden = enabled;
        if (!enabled) el.notice.textContent = t(key, text);
    }

    async function openChat(nickname, avatar, minimized = false) {
        if (avatar === undefined) {
            if (!conversations.length && !friends.length) await Promise.all([loadConversations(), loadFriends()]);
            const known = [...conversations, ...friends].find((p) => same(p.nickname, nickname));
            avatar = known?.avatar ?? null;
            if (known) nickname = known.nickname;
        }
        current = { nickname, avatar, blocked: false, oldestId: null, newestId: null };
        state.open = true;
        state.min = minimized;
        state.nick = nickname;
        save();
        const pic = el.who.querySelector('.player-pic');
        const photo = picFor({ nickname, avatar });
        const status = presence.get(nickname.toLowerCase());
        auth.presence.mark(photo, status);
        pic.replaceWith(photo);
        el.who.title = auth.presence.text(status) || nickname;
        el.name.textContent = nickname;
        const url = `perfil.html?n=${encodeURIComponent(nickname)}`;
        el.who.href = url;
        el.profileLink.href = url;
        el.error.textContent = '';
        el.messages.textContent = '';
        el.older.hidden = true;
        el.form.hidden = true;
        el.notice.hidden = true;
        el.input.value = '';
        grow();
        render();

        const [{ data: rows, error }, { data: blocked }] = await Promise.all([
            client.rpc('conversation', { p_nick: nickname, p_limit: 50 }),
            client.rpc('i_blocked', { p_nick: nickname }),
            conversations.length ? null : loadConversations()
        ]);
        if (current?.nickname !== nickname) return;
        if (error) {
            const [key, fallback] = messageError(error);
            el.error.textContent = t(key, fallback);
            return;
        }
        const list = (rows || []).slice().reverse();
        list.forEach((m) => el.messages.appendChild(bubble(m)));
        current.oldestId = list[0]?.id ?? null;
        current.newestId = list[list.length - 1]?.id ?? null;
        el.older.hidden = (rows || []).length < 50;
        el.scroll.scrollTop = el.scroll.scrollHeight;

        current.blocked = !!blocked;
        el.block.hidden = current.blocked;
        const convo = conversations.find((c) => same(c.nickname, nickname));
        const friend = friends.find((f) => same(f.nickname, nickname));
        if (current.blocked) {
            setComposer(false, 'youBlocked', 'You blocked this player. Unblock them on the Friends page to talk again.');
        } else if ((convo && convo.is_friend === false) || (!convo && friends.length && !friend)) {
            setComposer(false, 'notFriendsAnymore', 'You are no longer friends, so you cannot send new messages.');
        } else {
            setComposer(true);
            if (!isPhone()) el.input.focus();
        }
        markReadIfWatching();
    }

    async function markReadIfWatching() {
        if (!current || !watching()) return;
        const convo = conversations.find((c) => same(c.nickname, current.nickname));
        if (!convo?.unread) return;
        await client.rpc('mark_conversation_read', { p_nick: current.nickname });
        convo.unread = 0;
        render();
        notifyHeader();
    }

    el.older.addEventListener('click', async () => {
        if (!current?.oldestId) return;
        const before = el.scroll.scrollHeight;
        const { data: rows } = await client.rpc('conversation', { p_nick: current.nickname, p_before: current.oldestId, p_limit: 50 });
        const list = (rows || []).slice().reverse();
        const first = el.messages.firstChild;
        list.forEach((m) => el.messages.insertBefore(bubble(m), first));
        if (list.length) current.oldestId = list[0].id;
        el.older.hidden = (rows || []).length < 50;
        el.scroll.scrollTop = el.scroll.scrollHeight - before;
    });

    // ---------- enviar ----------
    const MAX_INPUT = 120;
    function grow() {
        el.input.style.height = 'auto';
        const h = el.input.scrollHeight;
        el.input.style.height = `${Math.min(h, MAX_INPUT)}px`;
        // Barra de rolagem só quando o texto passa da altura máxima
        el.input.style.overflowY = h > MAX_INPUT ? 'auto' : 'hidden';
    }
    el.input.addEventListener('input', () => { grow(); el.error.textContent = ''; });
    el.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            el.form.requestSubmit();
        }
    });
    let sending = false;
    el.form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!current || sending) return;
        const body = el.input.value.trim();
        if (!body) return;
        sending = true;
        el.send.disabled = true;
        const { data, error } = await client.rpc('send_message', { p_nick: current.nickname, p_body: body });
        el.send.disabled = false;
        sending = false;
        if (error) {
            const [key, fallback] = messageError(error);
            el.error.textContent = t(key, fallback);
            return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        const m = { id: row?.id, mine: true, body, created_at: row?.created_at || new Date().toISOString() };
        el.messages.appendChild(bubble(m));
        if (m.id) current.newestId = m.id;
        el.input.value = '';
        grow();
        el.scroll.scrollTop = el.scroll.scrollHeight;
        loadConversations();
    });

    // ---------- denunciar ----------
    async function reportMessage(id, btn) {
        const answer = await auth.reportDialog();
        if (!answer) return;
        btn.disabled = true;
        const { error } = await client.rpc('report_message', { p_id: id, p_reason: answer.reason, p_category: answer.category });
        if (error) {
            btn.disabled = false;
            const [key, fallback] = messageError(error);
            window.alert(t(key, fallback));
            return;
        }
        btn.textContent = t('reported', 'Reported');
    }

    // ---------- menu ⋯: ver perfil / bloquear ----------
    const setMenu = (open) => {
        el.menuList.hidden = !open;
        el.menuBtn.setAttribute('aria-expanded', String(open));
    };
    el.menuBtn.addEventListener('click', () => setMenu(el.menuList.hidden));
    document.addEventListener('click', (e) => { if (!e.target.closest('.dock-menu')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });
    el.block.addEventListener('click', async () => {
        setMenu(false);
        if (!current) return;
        if (!window.confirm(t('blockConfirm', 'Block this player? You will stop being friends and neither of you will be able to send messages or friend requests to the other.'))) return;
        const { error } = await client.rpc('block_player', { p_nick: current.nickname });
        if (error) {
            const [key, fallback] = messageError(error);
            window.alert(t(key, fallback));
            return;
        }
        current.blocked = true;
        el.block.hidden = true;
        setComposer(false, 'youBlocked', 'You blocked this player. Unblock them on the Friends page to talk again.');
        window.dispatchEvent(new Event('eor-friends-changed'));
        refreshList();
    });

    // ---------- mensagens chegando na hora ----------
    async function pullNew() {
        if (!current) return;
        const { data: rows } = await client.rpc('conversation', { p_nick: current.nickname, p_limit: 20 });
        const fresh = (rows || []).filter((m) => current.newestId === null || m.id > current.newestId).reverse();
        if (!fresh.length) return;
        const nearBottom = el.scroll.scrollHeight - el.scroll.scrollTop - el.scroll.clientHeight < 120;
        fresh.forEach((m) => el.messages.appendChild(bubble(m)));
        current.newestId = fresh[fresh.length - 1].id;
        if (nearBottom) el.scroll.scrollTop = el.scroll.scrollHeight;
    }
    client.channel(`inbox-${me.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient=eq.${me.id}` }, async () => {
            await Promise.all([pullNew(), loadConversations()]);
            if (!current) renderList();
            render();
            await markReadIfWatching();
            notifyHeader();
        })
        .subscribe();
    document.addEventListener('visibilitychange', markReadIfWatching);

    // ---------- links que abrem a janela ----------
    // Envelope do topo, "Mensagens" do menu do topo (que fecha sozinho), "Enviar mensagem" do perfil e da página Amigos.
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href^="mensagens.html"]');
        if (!link || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        const nick = new URL(link.href).searchParams.get('com');
        if (nick && auth.NICK_RE.test(nick)) {
            openChat(nick);
        } else if (state.open && !state.min && !current) {
            closeDock();
        } else {
            openDock();
        }
    });

    // ---------- sino: pedidos de amizade + mensagens não lidas ----------
    const bell = document.querySelector('.header-bell');
    const bellPanel = document.createElement('div');
    bellPanel.className = 'bell-panel';
    bellPanel.hidden = true;
    bell?.parentElement.appendChild(bellPanel);

    function setBell(open) {
        bellPanel.hidden = !open;
        bell?.setAttribute('aria-expanded', String(open));
    }
    async function renderBell() {
        const [{ data: rows }, , { data: notes }, { data: reports }] = await Promise.all([
            client.rpc('my_friendships'), loadConversations(),
            client.rpc('my_notifications', { p_limit: 15 }), client.rpc('admin_open_report_count')
        ]);
        const activity = notes || [];
        const requests = (rows || []).filter((r) => r.kind === 'received');
        const unread = conversations.filter((c) => c.unread);
        bellPanel.textContent = '';
        const title = document.createElement('p');
        title.className = 'bell-title';
        title.textContent = t('notifications', 'Notifications');
        const list = document.createElement('ul');
        list.className = 'bell-list';
        bellPanel.append(title, list);

        requests.forEach((r) => {
            const li = document.createElement('li');
            li.className = 'bell-item';
            const who = document.createElement('a');
            who.className = 'bell-who';
            who.href = `perfil.html?n=${encodeURIComponent(r.nickname)}`;
            const text = document.createElement('span');
            const name = document.createElement('strong');
            name.textContent = r.nickname;
            text.append(name, ` ${t('bellFriendRequest', 'wants to be your friend.')}`);
            who.append(picFor(r), text);
            const actions = document.createElement('div');
            actions.className = 'bell-actions';
            [['acceptFriend', 'Accept request', true, 'is-main'], ['declineFriend', 'Decline', false, '']].forEach(([key, fb, accept, cls]) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = `bell-btn ${cls}`;
                b.textContent = t(key, fb);
                b.addEventListener('click', async () => {
                    actions.querySelectorAll('button').forEach((x) => { x.disabled = true; });
                    const { error } = await client.rpc('respond_friend_request', { p_nick: r.nickname, p_accept: accept });
                    if (error) {
                        const [k, f] = auth.friendError(error);
                        window.alert(t(k, f));
                    }
                    window.dispatchEvent(new Event('eor-friends-changed'));
                    if (!error && accept) friends = [];
                    renderBell();
                });
                actions.appendChild(b);
            });
            li.append(who, actions);
            list.appendChild(li);
        });

        unread.forEach((c) => {
            const li = document.createElement('li');
            li.className = 'bell-item';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'bell-who';
            const text = document.createElement('span');
            const name = document.createElement('strong');
            name.textContent = c.nickname;
            const what = c.unread === 1
                ? t('bellOneMessage', 'sent you a message.')
                : t('bellManyMessages', 'sent you {n} messages.').replace('{n}', c.unread > 99 ? '99+' : c.unread);
            const preview = document.createElement('small');
            preview.textContent = c.last_body;
            text.append(name, ` ${what}`, preview);
            btn.append(picFor(c), text);
            btn.addEventListener('click', () => {
                setBell(false);
                openChat(c.nickname, c.avatar);
            });
            li.appendChild(btn);
            list.appendChild(li);
        });

        // Curtidas e comentários nas suas publicações
        activity.forEach((n) => {
            const li = document.createElement('li');
            li.className = `bell-item${n.unread ? ' is-new' : ''}`;
            const a = document.createElement('a');
            a.className = 'bell-who';
            a.href = `comunidade.html?post=${n.post_id}`;
            const text = document.createElement('span');
            const name = document.createElement('strong');
            name.textContent = n.nickname;
            const what = n.kind === 'like'
                ? t('bellLiked', 'liked your post.')
                : n.kind === 'best'
                    ? t('bellBest', 'chose your comment as the best answer:')
                    : n.kind === 'reply'
                        ? t('bellReplied', 'replied to your comment:')
                        : n.kind === 'mention'
                            ? t('bellMentioned', 'mentioned you:')
                            : t('bellCommented', 'commented on your post:');
            const preview = document.createElement('small');
            preview.textContent = n.snippet || '';
            const when = document.createElement('small');
            when.className = 'bell-when';
            when.textContent = new Date(n.created_at).toLocaleString(lang(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            text.append(name, ` ${what}`, preview, when);
            a.append(picFor(n), text);
            li.appendChild(a);
            list.appendChild(li);
        });
        if (activity.some((n) => n.unread)) {
            client.rpc('mark_notifications_read').then(() => notifyHeader());
        }

        if (!requests.length && !unread.length && !activity.length) {
            const li = document.createElement('li');
            li.className = 'bell-empty';
            li.textContent = t('noNotifications', 'No new notifications.');
            list.appendChild(li);
        }
        const more = document.createElement('a');
        more.className = 'bell-more';
        more.href = 'amigos.html';
        more.textContent = t('myFriends', 'My friends');
        bellPanel.appendChild(more);
        // Só aparece para o admin (o banco confere o cargo e o 2FA)
        if (reports !== null && reports !== undefined && (await isAdmin())) {
            const mod = document.createElement('a');
            mod.className = 'bell-more bell-mod';
            mod.href = 'moderacao.html';
            mod.textContent = t('modPanelTitle', 'Moderation') + (reports ? ` (${reports})` : '');
            bellPanel.appendChild(mod);
        }
    }
    let adminCheck = null;
    function isAdmin() {
        if (!adminCheck) adminCheck = client.rpc('is_admin').then(({ data }) => !!data);
        return adminCheck;
    }
    bell?.addEventListener('click', async () => {
        if (!bellPanel.hidden) { setBell(false); return; }
        await renderBell();
        setBell(true);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.header-bell-wrap')) setBell(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setBell(false); });

    document.addEventListener('site-language-changed', () => {
        applyTexts();
        renderList();
        render();
        if (!bellPanel.hidden) renderBell();
    });

    // ---------- início: volta como estava na página anterior ----------
    applyTexts();
    window.EorChat = { open: openDock, openChat: (nick) => openChat(nick), close: closeDock };
    const wanted = new URLSearchParams(window.location.search).get('chat');
    if (wanted && auth.NICK_RE.test(wanted)) {
        openChat(wanted);
    } else if (state.open && state.nick) {
        openChat(state.nick, undefined, !!saved.min);
    } else if (state.open) {
        await refreshList();
    } else {
        render();
    }
})();
