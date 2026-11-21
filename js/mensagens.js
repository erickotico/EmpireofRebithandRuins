// Mensagens entre amigos.
//   mensagens.html            → lista de conversas
//   mensagens.html?com=Apelido → abre a conversa com esse amigo
// Regras (só amigos, bloqueio, limites, 1 ano) ficam no banco: supabase/007_mensagens.sql.
// Tudo que vem do banco entra como TEXTO (textContent), nunca como HTML.
document.addEventListener('DOMContentLoaded', async () => {
    const t = (key, fallback) => (window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback);
    const $ = (id) => document.getElementById(id);
    const auth = window.EorAuth;
    const crests = window.SiteCrests;
    const status = $('msgStatus');
    const lang = () => (window.SiteI18n?.lang === 'pt' ? 'pt-BR' : 'en');

    function show(id) {
        status.hidden = true;
        $(id).hidden = false;
    }
    if (!auth || !crests) {
        status.textContent = t('errNetwork', 'Connection failed. Check your internet and try again.');
        return;
    }
    const { client } = auth;

    const { data: { session } } = await client.auth.getSession();
    if (!session) { show('msgGuest'); return; }
    const me = session.user;
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        window.location.replace('login.html');
        return;
    }

    // Erros das funções de mensagem → texto
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

    // ---------- utilidades ----------
    function picFor(p) {
        const el = document.createElement('span');
        el.className = 'player-pic';
        if (p.avatar && crests.find(p.avatar)) {
            el.innerHTML = crests.avatar(p.avatar);
        } else {
            el.classList.add('is-initial');
            el.textContent = p.nickname.charAt(0).toUpperCase();
        }
        return el;
    }
    function when(value) {
        const d = new Date(value);
        const today = new Date();
        const sameDay = d.toDateString() === today.toDateString();
        return sameDay
            ? d.toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit' })
            : d.toLocaleDateString(lang(), { day: 'numeric', month: 'short' });
    }
    function notifyHeader() {
        window.dispatchEvent(new Event('eor-messages-changed'));
    }

    // ---------- lista de conversas ----------
    let conversations = [];
    let current = null; // { nickname, avatar, blocked, oldestId, newestId }

    async function loadConversations() {
        const { data, error } = await client.rpc('my_conversations');
        if (error) {
            const [key, fallback] = messageError(error);
            status.textContent = t(key, fallback);
            status.hidden = false;
            return false;
        }
        conversations = data || [];
        renderConversations();
        return true;
    }

    function renderConversations() {
        const list = $('convList');
        list.textContent = '';
        $('convEmpty').hidden = conversations.length > 0;
        conversations.forEach((c) => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'conv-item';
            if (current && current.nickname.toLowerCase() === c.nickname.toLowerCase()) btn.classList.add('is-open');
            if (c.unread) btn.classList.add('is-unread');
            const text = document.createElement('span');
            text.className = 'conv-text';
            const top = document.createElement('span');
            top.className = 'conv-top';
            const name = document.createElement('strong');
            name.textContent = c.nickname;
            const time = document.createElement('small');
            time.textContent = when(c.last_at);
            top.append(name, time);
            const preview = document.createElement('span');
            preview.className = 'conv-preview';
            preview.textContent = (c.last_mine ? `${t('you', 'You')}: ` : '') + c.last_body;
            text.append(top, preview);
            btn.append(picFor(c), text);
            if (c.unread) {
                const badge = document.createElement('span');
                badge.className = 'conv-unread';
                badge.textContent = c.unread > 99 ? '99+' : String(c.unread);
                btn.appendChild(badge);
            }
            btn.addEventListener('click', () => openChat(c.nickname, c.avatar));
            li.appendChild(btn);
            list.appendChild(li);
        });
    }

    // ---------- nova conversa: escolher amigo ----------
    $('newChat').addEventListener('click', async () => {
        const picker = $('friendPicker');
        if (!picker.hidden) { picker.hidden = true; return; }
        const { data, error } = await client.rpc('my_friendships');
        const list = $('pickerList');
        list.textContent = '';
        const friends = error ? [] : (data || []).filter((r) => r.kind === 'friend');
        if (!friends.length) {
            const li = document.createElement('li');
            li.className = 'conv-empty';
            li.textContent = t('noFriendsToMessage', 'You have no friends yet. Add friends to send messages.');
            list.appendChild(li);
        }
        friends.forEach((f) => {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'conv-item';
            const name = document.createElement('strong');
            name.className = 'conv-text';
            name.textContent = f.nickname;
            btn.append(picFor(f), name);
            btn.addEventListener('click', () => {
                picker.hidden = true;
                openChat(f.nickname, f.avatar);
            });
            li.appendChild(btn);
            list.appendChild(li);
        });
        picker.hidden = false;
    });

    // ---------- conversa aberta ----------
    const chatList = $('chatMessages');
    const scroller = $('chatScroll');

    function bubble(m) {
        const li = document.createElement('li');
        li.className = `msg ${m.mine ? 'is-mine' : 'is-theirs'}`;
        li.dataset.id = m.id;
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

    function setComposer(enabled, noticeKey, noticeText) {
        $('chatForm').hidden = !enabled;
        const notice = $('chatNotice');
        notice.hidden = enabled;
        if (!enabled) notice.textContent = t(noticeKey, noticeText);
    }

    async function openChat(nickname, avatar) {
        current = { nickname, avatar, oldestId: null, newestId: null };
        $('chatPlaceholder').hidden = true;
        $('chat').hidden = false;
        document.querySelector('.messages-layout').classList.add('show-chat');
        const pic = $('chatPic');
        pic.replaceWith(Object.assign(picFor({ nickname, avatar }), { id: 'chatPic' }));
        $('chatName').textContent = nickname;
        const profileUrl = `perfil.html?n=${encodeURIComponent(nickname)}`;
        $('chatWho').href = profileUrl;
        $('chatProfileLink').href = profileUrl;
        $('chatError').textContent = '';
        chatList.textContent = '';
        $('chatOlder').hidden = true;
        window.history.replaceState(null, '', `${window.location.pathname}?com=${encodeURIComponent(nickname)}`);
        renderConversations();

        const [{ data: rows, error }, { data: blocked }] = await Promise.all([
            client.rpc('conversation', { p_nick: nickname, p_limit: 50 }),
            client.rpc('i_blocked', { p_nick: nickname })
        ]);
        if (error) {
            const [key, fallback] = messageError(error);
            $('chatError').textContent = t(key, fallback);
            return;
        }
        const list = (rows || []).slice().reverse();
        list.forEach((m) => chatList.appendChild(bubble(m)));
        current.oldestId = list[0]?.id ?? null;
        current.newestId = list[list.length - 1]?.id ?? null;
        $('chatOlder').hidden = (rows || []).length < 50;
        scroller.scrollTop = scroller.scrollHeight;

        current.blocked = !!blocked;
        const convo = conversations.find((c) => c.nickname.toLowerCase() === nickname.toLowerCase());
        if (current.blocked) {
            setComposer(false, 'youBlocked', 'You blocked this player. Unblock them on the Friends page to talk again.');
        } else if (convo && convo.is_friend === false) {
            setComposer(false, 'notFriendsAnymore', 'You are no longer friends, so you cannot send new messages.');
        } else {
            setComposer(true);
            if (!window.matchMedia('(max-width: 760px)').matches) $('chatInput').focus();
        }
        $('chatBlock').textContent = t('blockPlayer', 'Block player');
        $('chatBlock').hidden = current.blocked;

        if (convo?.unread) {
            await client.rpc('mark_conversation_read', { p_nick: nickname });
            convo.unread = 0;
            renderConversations();
            notifyHeader();
        }
    }

    $('chatOlder').addEventListener('click', async () => {
        if (!current?.oldestId) return;
        const before = scroller.scrollHeight;
        const { data: rows } = await client.rpc('conversation', { p_nick: current.nickname, p_before: current.oldestId, p_limit: 50 });
        const list = (rows || []).slice().reverse();
        const first = chatList.firstChild;
        list.forEach((m) => chatList.insertBefore(bubble(m), first));
        if (list.length) current.oldestId = list[0].id;
        $('chatOlder').hidden = (rows || []).length < 50;
        scroller.scrollTop = scroller.scrollHeight - before;
    });

    $('chatBack').addEventListener('click', () => {
        document.querySelector('.messages-layout').classList.remove('show-chat');
        window.history.replaceState(null, '', window.location.pathname);
    });

    // ---------- enviar ----------
    const input = $('chatInput');
    input.placeholder = t('typeMessage', 'Type a message');
    const grow = () => {
        input.style.height = 'auto';
        input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
    };
    input.addEventListener('input', () => { grow(); $('chatError').textContent = ''; });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            $('chatForm').requestSubmit();
        }
    });

    let sending = false;
    $('chatForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!current || sending) return;
        const body = input.value.trim();
        if (!body) return;
        sending = true;
        const button = $('chatForm').querySelector('button[type="submit"]');
        button.disabled = true;
        const { data, error } = await client.rpc('send_message', { p_nick: current.nickname, p_body: body });
        button.disabled = false;
        sending = false;
        if (error) {
            const [key, fallback] = messageError(error);
            $('chatError').textContent = t(key, fallback);
            return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        const m = { id: row?.id, mine: true, body, created_at: row?.created_at || new Date().toISOString() };
        chatList.appendChild(bubble(m));
        current.newestId = m.id;
        input.value = '';
        grow();
        scroller.scrollTop = scroller.scrollHeight;
        loadConversations();
    });

    // ---------- denunciar ----------
    async function reportMessage(id, btn) {
        const reason = window.prompt(t('reportPrompt', 'Why are you reporting this message? (optional)'), '');
        if (reason === null) return;
        btn.disabled = true;
        const { error } = await client.rpc('report_message', { p_id: id, p_reason: reason.slice(0, 300) });
        if (error) {
            btn.disabled = false;
            const [key, fallback] = messageError(error);
            window.alert(t(key, fallback));
            return;
        }
        btn.textContent = t('reported', 'Reported');
    }

    // ---------- menu: bloquear ----------
    const menuBtn = $('chatMenuBtn');
    const menu = $('chatMenu');
    const setMenu = (open) => {
        menu.hidden = !open;
        menuBtn.setAttribute('aria-expanded', String(open));
    };
    menuBtn.addEventListener('click', () => setMenu(menu.hidden));
    document.addEventListener('click', (e) => { if (!e.target.closest('.chat-menu')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

    $('chatBlock').addEventListener('click', async () => {
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
        $('chatBlock').hidden = true;
        setComposer(false, 'youBlocked', 'You blocked this player. Unblock them on the Friends page to talk again.');
        window.dispatchEvent(new Event('eor-friends-changed'));
        loadConversations();
    });

    // ---------- mensagens chegando na hora ----------
    async function pullNew() {
        if (!current) return;
        const { data: rows } = await client.rpc('conversation', { p_nick: current.nickname, p_limit: 20 });
        const fresh = (rows || []).filter((m) => current.newestId === null || m.id > current.newestId).reverse();
        if (!fresh.length) return;
        const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 120;
        fresh.forEach((m) => chatList.appendChild(bubble(m)));
        current.newestId = fresh[fresh.length - 1].id;
        if (nearBottom) scroller.scrollTop = scroller.scrollHeight;
        if (fresh.some((m) => !m.mine) && document.visibilityState === 'visible') {
            await client.rpc('mark_conversation_read', { p_nick: current.nickname });
        }
    }
    client.channel(`inbox-${me.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient=eq.${me.id}` }, async () => {
            await pullNew();
            await loadConversations();
            notifyHeader();
        })
        .subscribe();
    // Ao voltar para a aba, marca como lida a conversa aberta
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState !== 'visible' || !current) return;
        const convo = conversations.find((c) => c.nickname.toLowerCase() === current.nickname.toLowerCase());
        if (convo?.unread) {
            await client.rpc('mark_conversation_read', { p_nick: current.nickname });
            await loadConversations();
            notifyHeader();
        }
    });

    // ---------- início ----------
    if (!(await loadConversations())) return;
    show('msgWrap');
    document.addEventListener('site-language-changed', () => {
        renderConversations();
        input.placeholder = t('typeMessage', 'Type a message');
    });
    const wanted = new URLSearchParams(window.location.search).get('com');
    if (wanted && auth.NICK_RE.test(wanted)) {
        const convo = conversations.find((c) => c.nickname.toLowerCase() === wanted.toLowerCase());
        if (convo) {
            openChat(convo.nickname, convo.avatar);
        } else {
            const { data } = await client.rpc('my_friendships');
            const friend = (data || []).find((r) => r.kind === 'friend' && r.nickname.toLowerCase() === wanted.toLowerCase());
            if (friend) openChat(friend.nickname, friend.avatar);
        }
    }
});
