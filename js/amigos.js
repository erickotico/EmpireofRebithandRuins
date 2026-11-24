// Página Amigos: lista de amigos, pedidos recebidos e pedidos enviados.
// Tudo passa pelas funções do banco (supabase/005_amizades.sql); nada de HTML vindo do banco.
document.addEventListener('DOMContentLoaded', async () => {
    const t = (key, fallback) => (window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback);
    const $ = (id) => document.getElementById(id);
    const auth = window.EorAuth;
    const crests = window.SiteCrests;
    const status = $('friendsStatus');
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
    if (!session) { show('friendsGuest'); return; }
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
        window.location.replace('login.html');
        return;
    }

    // ---------- abas ----------
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    function selectTab(name, focus = false) {
        tabs.forEach((tab) => {
            const on = tab.dataset.tab === name;
            tab.setAttribute('aria-selected', String(on));
            tab.tabIndex = on ? 0 : -1;
            $(tab.getAttribute('aria-controls')).hidden = !on;
            if (on && focus) tab.focus();
        });
        window.history.replaceState(null, '', `${window.location.pathname}#${name}`);
    }
    tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => selectTab(tab.dataset.tab));
        tab.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
            const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
            selectTab(next.dataset.tab, true);
        });
    });

    // ---------- listas ----------
    let rows = [];
    let blocks = [];
    let presence = new Map(); // amigos online / visto por último
    async function load() {
        const [{ data, error }, blockResult, online] = await Promise.all([
            client.rpc('my_friendships'), client.rpc('my_blocks'), auth.presence.friends(true)
        ]);
        presence = online;
        blocks = blockResult.error ? [] : (blockResult.data || []);
        if (error) {
            const [key, fallback] = auth.friendError(error);
            status.textContent = t(key, fallback);
            status.hidden = false;
            return false;
        }
        rows = data || [];
        render();
        return true;
    }

    function pic(p) {
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

    function button(key, fallback, className, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = className;
        b.textContent = t(key, fallback);
        b.addEventListener('click', onClick);
        return b;
    }

    function link(key, fallback, className, href) {
        const a = document.createElement('a');
        a.className = className;
        a.href = href;
        a.textContent = t(key, fallback);
        return a;
    }

    function row(p, actions) {
        const item = document.createElement('div');
        item.className = 'friend-row';
        const link = document.createElement('a');
        link.className = 'player-link';
        link.href = `perfil.html?n=${encodeURIComponent(p.nickname)}`;
        const name = document.createElement('span');
        name.className = 'player-name';
        name.textContent = p.nickname;
        const since = document.createElement('small');
        since.textContent = new Date(p.since).toLocaleDateString(lang(), { day: 'numeric', month: 'short', year: 'numeric' });
        name.appendChild(since);
        // Amigos: online agora / visto por último (no lugar da data, se houver)
        const status = p.kind === 'friend' ? presence.get(p.nickname.toLowerCase()) : null;
        const seen = auth.presence.text(status);
        if (seen) {
            since.textContent = seen;
            since.className = auth.presence.textClass(status);
        }
        const photo = pic(p);
        if (p.kind === 'friend') auth.presence.mark(photo, presence.get(p.nickname.toLowerCase()));
        link.append(photo, name);
        const box = document.createElement('div');
        box.className = 'friend-row-actions';
        actions.forEach((a) => box.appendChild(a));
        item.append(link, box);
        return item;
    }

    async function act(fn, args, btn) {
        btn.disabled = true;
        const { error } = await client.rpc(fn, args);
        if (error) {
            btn.disabled = false;
            const [key, fallback] = auth.friendError(error);
            window.alert(t(key, fallback));
            return;
        }
        await load();
        window.dispatchEvent(new Event('eor-friends-changed'));
    }

    function fill(panelId, list, emptyKey, emptyText, actionsFor) {
        const panel = $(panelId);
        panel.textContent = '';
        if (!list.length) {
            const p = document.createElement('p');
            p.className = 'friends-empty';
            p.textContent = t(emptyKey, emptyText);
            panel.appendChild(p);
            return;
        }
        list.forEach((p) => panel.appendChild(row(p, actionsFor(p))));
    }

    function render() {
        const on = (p) => presence.get(p.nickname.toLowerCase());
        // online primeiro
        const friendsList = rows.filter((r) => r.kind === 'friend')
            .sort((x, y) => (auth.presence.active(on(y)) ? 1 : 0) - (auth.presence.active(on(x)) ? 1 : 0));
        const received = rows.filter((r) => r.kind === 'received');
        const sent = rows.filter((r) => r.kind === 'sent');
        $('countFriends').textContent = friendsList.length || '';
        $('countReceived').textContent = received.length || '';
        $('countSent').textContent = sent.length || '';
        $('countBlocked').textContent = blocks.length || '';
        fill('listBlocked', blocks, 'noBlocked', 'You have not blocked anyone.', (p) => [
            button('unblockPlayer', 'Unblock player', 'small-link link-button friend-remove', (e) => act('unblock_player', { p_nick: p.nickname }, e.currentTarget))
        ]);

        fill('listFriends', friendsList, 'noFriendsYetOwn', 'You have no friends yet. Visit a player\'s profile and click "Add friend".', (p) => [
            link('sendMessage', 'Send message', 'btn btn-login', `mensagens.html?com=${encodeURIComponent(p.nickname)}`),
            button('removeFriend', 'Remove friend', 'small-link link-button friend-remove', (e) => {
                if (window.confirm(t('removeFriendConfirm', 'Remove this player from your friends?'))) act('remove_friend', { p_nick: p.nickname }, e.currentTarget);
            })
        ]);
        fill('listReceived', received, 'noRequestsReceived', 'No requests waiting.', (p) => [
            button('acceptFriend', 'Accept request', 'btn btn-download', (e) => act('respond_friend_request', { p_nick: p.nickname, p_accept: true }, e.currentTarget)),
            button('declineFriend', 'Decline', 'btn btn-login', (e) => act('respond_friend_request', { p_nick: p.nickname, p_accept: false }, e.currentTarget))
        ]);
        fill('listSent', sent, 'noRequestsSent', 'No requests sent.', (p) => [
            button('cancelRequest', 'Cancel request', 'small-link link-button friend-remove', (e) => act('remove_friend', { p_nick: p.nickname }, e.currentTarget))
        ]);
    }

    if (!(await load())) return;
    show('friendsWrap');
    const startTab = ['amigos', 'recebidos', 'enviados', 'bloqueados'].includes(window.location.hash.slice(1))
        ? window.location.hash.slice(1)
        : (rows.some((r) => r.kind === 'received') ? 'recebidos' : 'amigos');
    selectTab(startTab);
    document.addEventListener('site-language-changed', render);

    // ---------- adicionar pelo apelido ----------
    const form = $('friendAddForm');
    const input = $('friendNick');
    const msg = $('friendAddMsg');
    input.placeholder = t('friendNickPlaceholder', "Friend's nickname");
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nick = input.value.trim();
        msg.textContent = '';
        if (!auth.NICK_RE.test(nick)) {
            msg.dataset.kind = 'error';
            msg.textContent = t('errPlayerNotFound', 'Player not found.');
            return;
        }
        const btn = form.querySelector('button');
        btn.disabled = true;
        const { data, error } = await client.rpc('send_friend_request', { p_nick: nick });
        btn.disabled = false;
        if (error) {
            const [key, fallback] = auth.friendError(error);
            msg.dataset.kind = 'error';
            msg.textContent = t(key, fallback);
            return;
        }
        input.value = '';
        msg.dataset.kind = 'success';
        msg.textContent = data === 'accepted'
            ? t('friendAccepted', 'You are now friends!')
            : t('friendRequestSent', 'Friend request sent!');
        await load();
        selectTab(data === 'accepted' ? 'amigos' : 'enviados');
    });
});
