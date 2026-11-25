// Perfil do jogador.
//   perfil.html                → o seu perfil (precisa estar logado), com as abas Perfil / Configurações
//   perfil.html#configuracoes  → abre direto em Configurações
//   perfil.html?n=Apelido      → perfil público de outro jogador (sem abas)
// Tudo que vem do banco entra na página como TEXTO (textContent), nunca como HTML.
document.addEventListener('DOMContentLoaded', async () => {
    const t = (key, fallback) => (window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback);
    const txt = (field) => window.SiteI18n?.text(field) ?? (field?.pt ?? String(field ?? ''));
    const $ = (id) => document.getElementById(id);
    const auth = window.EorAuth;
    const crests = window.SiteCrests;
    const status = $('profileStatus');

    function show(id) {
        status.hidden = true;
        $(id).hidden = false;
    }

    if (!auth || !crests) {
        status.textContent = t('errNetwork', 'Connection failed. Check your internet and try again.');
        return;
    }
    const { client } = auth;
    const params = new URLSearchParams(window.location.search);
    const wanted = (params.get('n') || '').trim();

    const lang = () => (window.SiteI18n?.lang === 'pt' ? 'pt-BR' : 'en');
    const fmtDate = (value, opts) => new Date(value).toLocaleDateString(lang(), opts);

    const { data: { session } } = await client.auth.getSession();
    const me = session?.user ?? null;

    // Entrou com a senha mas ainda não digitou o código do autenticador → volta para o login
    if (me && !wanted) {
        const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
            window.location.replace('login.html');
            return;
        }
    }

    // Qual perfil mostrar?
    // Se o banco ainda não tiver a coluna "avatar" (003_avatar.sql não rodado), busca sem ela.
    // Se o banco ainda não tiver alguma coluna nova (scripts 003/004 não rodados), tenta com menos campos.
    const FIELD_SETS = [
        'id, nickname, bio, avatar, shown_badges, friends_public, created_at',
        'id, nickname, bio, avatar, shown_badges, created_at',
        'id, nickname, bio, avatar, created_at',
        'id, nickname, bio, created_at'
    ];
    async function fetchProfile(filter) {
        let result;
        for (const fields of FIELD_SETS) {
            result = await filter(client.from('profiles').select(fields));
            if (result.error?.code !== '42703') break;
            console.warn('[perfil] coluna faltando no banco; rode os scripts em supabase/ (003, 004)');
        }
        return result;
    }

    let profile = null;
    if (wanted) {
        if (!auth.NICK_RE.test(wanted)) { show('profileMissing'); return; }
        // ilike sem curingas: escapa _ e % para buscar o apelido exato (sem diferenciar maiúsculas)
        const pattern = wanted.replace(/[\\%_]/g, (c) => `\\${c}`);
        const { data, error } = await fetchProfile((q) => q.ilike('nickname', pattern).maybeSingle());
        if (error || !data) { show('profileMissing'); return; }
        profile = data;
    } else {
        const backTo = { '#excluir-conta': 'excluir', '#recuperacao': 'recuperacao', '#responsavel': 'responsavel' }[window.location.hash];
        if (!me && backTo) { window.location.replace(`login.html?volta=${backTo}`); return; }
        if (!me) { show('profileGuest'); return; }
        const { data, error } = await fetchProfile((q) => q.eq('id', me.id).maybeSingle());
        if (error || !data) { show('profileMissing'); return; }
        profile = data;
    }

    const isOwner = !!me && me.id === profile.id;

    // ---------- publicações (centro) ----------
    if (window.EorFeed) {
        const posts = window.EorFeed.list($('profilePosts'), {
            author: profile.nickname,
            emptyText: t('noPostsYet', 'No posts yet')
        });
        if (isOwner) window.EorFeed.composer($('profileComposer'), (id) => posts.prepend(id));
        document.addEventListener('site-language-changed', () => posts.reload());
    }

    // ---------- cabeçalho e aba Perfil ----------
    function renderAvatar() {
        const box = $('profileAvatar');
        const hero = $('profileHero');
        if (profile.avatar && crests.find(profile.avatar)) {
            box.innerHTML = crests.avatar(profile.avatar, 'crest profile-crest');
            box.classList.remove('is-initial');
            hero.style.setProperty('--avatar', crests.color(profile.avatar));
        } else {
            box.textContent = '';
            const initial = document.createElement('span');
            initial.textContent = profile.nickname.charAt(0).toUpperCase();
            box.appendChild(initial);
            box.classList.add('is-initial');
            hero.style.removeProperty('--avatar');
        }
    }

    function render() {
        renderAvatar();
        $('profileName').textContent = profile.nickname;
        $('profileSince').textContent = fmtDate(profile.created_at, { month: 'long', year: 'numeric' });
        $('profileSince').dateTime = profile.created_at;
        $('profileBio').textContent = profile.bio;
        $('profileBio').hidden = !profile.bio;
        $('profileBioEmpty').hidden = !!profile.bio;
        $('profileBioEmpty').textContent = isOwner
            ? t('bioEmptyOwn', 'You have not written anything yet. Add a few words in Edit profile.')
            : t('bioEmpty', 'This player has not written anything yet.');
        document.title = `${profile.nickname} · Empire of Rebirth & Ruins`;
    }
    // ---------- insígnias ----------
    // Pioneiro da Alfa: conta criada enquanto o jogo está em Alfa.
    // Quando a Alfa acabar, coloque a data aqui (ex.: '2027-03-01') e só quem entrou antes mantém a insígnia.
    const ALPHA_ENDS_AT = null;
    const BADGES = [
        {
            id: 'pioneer',
            has: (p) => !ALPHA_ENDS_AT || new Date(p.created_at) < new Date(ALPHA_ENDS_AT),
            icon: '<path d="M12 3 L14.6 8.6 L20.7 9.3 L16.2 13.4 L17.4 19.5 L12 16.5 L6.6 19.5 L7.8 13.4 L3.3 9.3 L9.4 8.6 Z"/>',
            name: ['badgePioneer', 'Alpha Pioneer'],
            desc: ['badgePioneerDesc', 'Joined during the Alpha.']
        },
        {
            // Respostas escolhidas como "melhor resposta" na Taverna (o banco conta, sem valer a própria pergunta)
            id: 'helper',
            has: (p) => (p.best_answers || 0) >= 3,
            icon: '<path fill-rule="evenodd" d="M12 2 L20 5 V11 C20 16 16.5 19.8 12 22 C7.5 19.8 4 16 4 11 V5 Z M10.6 15.8 L16.6 9.8 L15.2 8.4 L10.6 13 L8.4 10.8 L7 12.2 Z"/>',
            name: ['badgeHelper', 'Helper'],
            desc: ['badgeHelperDesc', '3 answers chosen as best in the Tavern.']
        },
        {
            id: 'sage',
            has: (p) => (p.best_answers || 0) >= 15,
            icon: '<path d="M6 3 H18 L17 9 C16.6 11.6 14.6 13.4 13 13.8 V18 H16 V21 H8 V18 H11 V13.8 C9.4 13.4 7.4 11.6 7 9 Z"/>',
            name: ['badgeSage', 'Tavern Sage'],
            desc: ['badgeSageDesc', '15 answers chosen as best in the Tavern.']
        }
    ];
    const MAX_SHOWN = 5;
    // Só conta o que o jogador conquistou de verdade (a escolha salva no banco só filtra).
    const earnedBadges = () => BADGES.filter((b) => b.has(profile));
    function shownBadges() {
        const earned = earnedBadges();
        if (!Array.isArray(profile.shown_badges)) return earned.slice(0, MAX_SHOWN);
        return profile.shown_badges
            .map((id) => earned.find((b) => b.id === id))
            .filter(Boolean)
            .slice(0, MAX_SHOWN);
    }
    function renderBadges() {
        $('statBadges').textContent = String(earnedBadges().length);
        const list = $('badgeList');
        list.textContent = '';
        const shown = shownBadges();
        if (!shown.length) {
            const li = document.createElement('li');
            li.className = 'badge-empty';
            li.textContent = t('noBadges', 'No badges yet.');
            list.appendChild(li);
            return;
        }
        shown.forEach((badge) => {
            const li = document.createElement('li');
            li.className = 'badge';
            li.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${badge.icon}</svg><span><strong></strong><small></small></span>`;
            li.querySelector('strong').textContent = t(...badge.name);
            li.querySelector('small').textContent = t(...badge.desc);
            list.appendChild(li);
        });
    }

    render();
    renderBadges();
    show('profileWrap');

    // Abas do celular (Publicações | Sobre | Amigos). No computador tudo aparece junto.
    const tabButtons = [...document.querySelectorAll('.profile-tabs-mobile [role="tab"]')];
    tabButtons.forEach((button, i) => {
        button.addEventListener('click', () => {
            $('profileView').dataset.tab = button.dataset.tab;
            tabButtons.forEach((b) => b.setAttribute('aria-selected', String(b === button)));
        });
        button.addEventListener('keydown', (e) => {
            const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
            if (!dir) return;
            const next = tabButtons[(i + dir + tabButtons.length) % tabButtons.length];
            next.focus();
            next.click();
        });
    });

    // Números do jogador (insígnias de Ajudante). Chegam depois; aí redesenha as insígnias.
    // Online / visto por último (só aparece para amigos; o banco decide)
    if (me && me.id !== profile.id && auth.presence) {
        client.rpc('presence_of', { p_nick: profile.nickname }).then(({ data }) => {
            const row = Array.isArray(data) ? data[0] : data;
            const text = auth.presence.text(row);
            const el = $('profilePresence');
            el.hidden = !text;
            el.textContent = text;
            el.className = `profile-presence ${auth.presence.textClass(row)}`;
        });
    }

    const statsListeners = [];
    client.rpc('player_stats', { p_nick: profile.nickname }).then(({ data }) => {
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) return;
        profile.best_answers = row.best_answers;
        $('statPosts').textContent = String(row.posts ?? 0);
        $('statBest').textContent = String(row.best_answers ?? 0);
        renderBadges();
        statsListeners.forEach((fn) => fn());
    });
    document.addEventListener('site-language-changed', () => { render(); renderBadges(); renderFriends(); renderFriendAction(); });

    // ---------- amigos (quadro na direita) ----------
    // Lista privada: o banco devolve só a quantidade para quem não é o dono.
    let friends = null; // { list, total, isPrivate }
    let friendsExpanded = false;
    const mobile = window.matchMedia('(max-width: 760px)');
    mobile.addEventListener('change', () => renderFriends());
    // "Ver todos": no seu perfil abre a página Amigos; no de outro jogador, abre a lista aqui mesmo.
    $('friendsMore').addEventListener('click', () => {
        if (isOwner) { window.location.href = 'amigos.html'; return; }
        friendsExpanded = true;
        renderFriends();
    });
    function playerItem(p) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = `perfil.html?n=${encodeURIComponent(p.nickname)}`;
        a.className = 'player-link';
        const pic = document.createElement('span');
        pic.className = 'player-pic';
        if (p.avatar && crests.find(p.avatar)) {
            pic.innerHTML = crests.avatar(p.avatar);
        } else {
            pic.classList.add('is-initial');
            pic.textContent = p.nickname.charAt(0).toUpperCase();
        }
        const name = document.createElement('span');
        name.className = 'player-name';
        name.textContent = p.nickname;
        a.append(pic, name);
        li.appendChild(a);
        return li;
    }
    function renderFriends() {
        if (!friends) return;
        $('statFriends').textContent = String(friends.total ?? 0);
        $('friendsCard').hidden = false;
        $('friendsTotal').textContent = friends.total ? `(${friends.total})` : '';
        const list = $('friendList');
        list.textContent = '';
        // Amigos no quadro: 8 no computador (grade de 2), 12 na aba Amigos do celular. O resto em "Ver todos".
        const limit = friendsExpanded ? Infinity : (mobile.matches ? 12 : 8);
        friends.list.slice(0, limit).forEach((p) => list.appendChild(playerItem(p)));
        const more = $('friendsMore');
        const hasMore = friends.total > Math.min(limit, friends.list.length) && !friends.isPrivate;
        more.hidden = !hasMore || (friendsExpanded && !isOwner);
        more.textContent = `${t('seeAllFriends', 'See all')} (${friends.total})`;
        const empty = $('friendsEmpty');
        empty.hidden = friends.list.length > 0;
        empty.textContent = friends.isPrivate
            ? t('friendsPrivate', 'This player keeps their friends list private.')
            : t('noFriendsYet', 'No friends yet.');
    }
    async function loadFriends() {
        const { data, error } = await client.rpc('friends_of', { p_nick: profile.nickname });
        if (error) return; // banco ainda sem o script 005: o quadro continua escondido
        const rows = data || [];
        friends = {
            total: rows[0]?.total ?? 0,
            isPrivate: !!rows[0]?.is_private,
            list: rows.filter((r) => r.nickname)
        };
        renderFriends();
    }
    loadFriends();

    // ---------- botão de amizade no perfil de outro jogador ----------
    let friendState = null; // none | sent | received | friends | guest
    const friendMsg = $('friendMsg');
    let iBlocked = false;
    function renderFriendAction() {
        if (!friendState) return;
        const main = $('friendMain');
        const block = $('blockToggle');
        // Bloqueado por mim: só aparece "Desbloquear"
        block.hidden = friendState === 'guest';
        block.textContent = iBlocked ? t('unblockPlayer', 'Unblock player') : t('blockPlayer', 'Block player');
        main.hidden = iBlocked;
        $('friendMessage').hidden = iBlocked || friendState !== 'friends';
        $('friendMessage').href = `mensagens.html?com=${encodeURIComponent(profile.nickname)}`;
        if (iBlocked) {
            $('friendSecondary').hidden = true;
            $('friendAction').hidden = false;
            return;
        }
        const secondary = $('friendSecondary');
        const labels = {
            guest: ['addFriend', 'Add friend'],
            none: ['addFriend', 'Add friend'],
            sent: ['requestSent', 'Request sent'],
            received: ['acceptFriend', 'Accept request'],
            friends: ['friendsCheck', 'Friends ✓']
        };
        main.textContent = t(...labels[friendState]);
        main.className = `btn ${['none', 'guest', 'received'].includes(friendState) ? 'btn-download' : 'btn-login'}`;
        main.disabled = friendState === 'sent' || friendState === 'friends';
        const second = { sent: ['cancelRequest', 'Cancel request'], received: ['declineFriend', 'Decline'], friends: ['removeFriend', 'Remove friend'] }[friendState];
        secondary.hidden = !second;
        if (second) secondary.textContent = t(...second);
        $('friendAction').hidden = false;
    }
    async function friendCall(fn, args, okKey, okText) {
        $('friendMain').disabled = true;
        $('friendSecondary').disabled = true;
        const { data, error } = await client.rpc(fn, args);
        $('friendSecondary').disabled = false;
        if (error) {
            const [key, fallback] = auth.friendError(error);
            friendMsg.dataset.kind = 'error';
            friendMsg.textContent = t(key, fallback);
            renderFriendAction();
            return { ok: false };
        }
        friendMsg.dataset.kind = 'success';
        friendMsg.textContent = okKey ? t(okKey, okText) : '';
        return { ok: true, data };
    }
    if (!isOwner) {
        if (!me) {
            friendState = 'guest';
            renderFriendAction();
        } else {
            const [{ data, error }, blocked] = await Promise.all([
                client.rpc('friendship_status', { p_nick: profile.nickname }),
                client.rpc('i_blocked', { p_nick: profile.nickname })
            ]);
            client.rpc('is_admin').then(({ data: admin }) => {
                if (!admin) return;
                const link = $('modLink');
                link.href = `moderacao.html#jogador=${encodeURIComponent(profile.nickname)}`;
                link.hidden = false;
            });
            if (!error) {
                iBlocked = blocked.error ? false : !!blocked.data;
                friendState = data || 'none';
                renderFriendAction();
            }
        }
        $('blockToggle').addEventListener('click', async () => {
            if (!iBlocked && !window.confirm(t('blockConfirm', 'Block this player? You will stop being friends and neither of you will be able to send messages or friend requests to the other.'))) return;
            const fn = iBlocked ? 'unblock_player' : 'block_player';
            const result = await friendCall(fn, { p_nick: profile.nickname }, iBlocked ? 'playerUnblocked' : 'playerBlocked', iBlocked ? 'Player unblocked.' : 'Player blocked.');
            if (!result.ok) return;
            if (!iBlocked) {
                const wasFriend = friendState === 'friends';
                friendState = 'none';
                if (wasFriend) loadFriends();
            }
            iBlocked = !iBlocked;
            renderFriendAction();
            window.dispatchEvent(new Event('eor-friends-changed'));
        });
        $('friendMain').addEventListener('click', async () => {
            if (friendState === 'guest') { window.location.href = 'login.html'; return; }
            if (friendState === 'none') {
                const result = await friendCall('send_friend_request', { p_nick: profile.nickname }, 'friendRequestSent', 'Friend request sent!');
                if (result.ok) {
                    // 'accepted' = o outro já tinha te pedido: viraram amigos na hora
                    friendState = result.data === 'accepted' ? 'friends' : 'sent';
                    if (friendState === 'friends') {
                        friendMsg.textContent = t('friendAccepted', 'You are now friends!');
                        loadFriends();
                    }
                }
            } else if (friendState === 'received') {
                if ((await friendCall('respond_friend_request', { p_nick: profile.nickname, p_accept: true }, 'friendAccepted', 'You are now friends!')).ok) {
                    friendState = 'friends';
                    loadFriends();
                }
            }
            renderFriendAction();
        });
        $('friendSecondary').addEventListener('click', async () => {
            if (friendState === 'friends' && !window.confirm(t('removeFriendConfirm', 'Remove this player from your friends?'))) return;
            const { ok } = friendState === 'received'
                ? await friendCall('respond_friend_request', { p_nick: profile.nickname, p_accept: false }, '', '')
                : await friendCall('remove_friend', { p_nick: profile.nickname }, '', '');
            if (ok) {
                const wasFriend = friendState === 'friends';
                friendState = 'none';
                if (wasFriend) loadFriends();
            }
            renderFriendAction();
        });
    }

    if (!isOwner) return;
    $('myFriendsLink').hidden = false;

    // ---------- editar perfil (só o dono) ----------
    function setEditing(on, focus = true) {
        $('profileView').hidden = on;
        $('profileEdit').hidden = !on;
        const hash = on ? '#editar' : '';
        window.history.replaceState(null, '', window.location.pathname + window.location.search + hash);
        window.scrollTo({ top: 0 });
        if (focus) (on ? $('closeEdit') : $('editProfile')).focus();
    }
    $('editProfile').hidden = false;
    $('editProfile').addEventListener('click', () => setEditing(true));
    $('closeEdit').addEventListener('click', () => setEditing(false));
    if (['#editar', '#configuracoes'].includes(window.location.hash) || params.has('senha')) setEditing(true, false);

    // ---------- foto do perfil (brasões) ----------
    const avatarMsg = $('avatarMsg');
    const setMsg = (el, key, fallback, kind = 'info') => {
        el.dataset.kind = kind;
        el.textContent = key ? t(key, fallback) : '';
    };

    // Nomes dos reinos e das classes vêm dos arquivos do jogo
    const names = {};
    try {
        const [reinos, classes] = await Promise.all([
            fetch('data/reinos.json').then((r) => r.json()),
            fetch('data/classesData.json').then((r) => r.json())
        ]);
        (Array.isArray(reinos) ? reinos : reinos.kingdoms || []).forEach((k) => { names[`reino:${k.id}`] = k.name; });
        (classes.classes || []).forEach((c) => { names[`classe:${c.id}`] = c.name; });
    } catch { /* sem nomes: os botões ficam só com o brasão */ }

    function avatarButton(value) {
        const label = txt(names[value]) || value.split(':')[1];
        return `<button type="button" class="avatar-option" role="radio" data-avatar="${value}" aria-checked="false">
                ${crests.avatar(value)}
                <span class="avatar-name">${label.replace(/[&<>"']/g, '')}</span>
            </button>`;
    }
    function renderPicker() {
        $('avatarKingdoms').innerHTML = Object.keys(crests.KINGDOMS).map((id) => avatarButton(`reino:${id}`)).join('');
        $('avatarClasses').innerHTML = Object.keys(crests.CLASSES).map((id) => avatarButton(`classe:${id}`)).join('');
        markPicked();
    }
    function markPicked() {
        document.querySelectorAll('.avatar-option').forEach((btn) => {
            btn.setAttribute('aria-checked', String(btn.dataset.avatar === profile.avatar));
        });
        $('avatarClear').hidden = !profile.avatar;
    }
    renderPicker();
    document.addEventListener('site-language-changed', renderPicker);

    async function saveAvatar(value) {
        const previous = profile.avatar;
        profile.avatar = value;
        renderAvatar();
        markPicked();
        setMsg(avatarMsg, 'saving', 'Saving...');
        const { error } = await client.from('profiles').update({ avatar: value }).eq('id', me.id);
        if (error) {
            console.warn('[perfil]', error.code, error.message);
            profile.avatar = previous;
            renderAvatar();
            markPicked();
            setMsg(avatarMsg, 'errGeneric', 'Something went wrong. Please try again.', 'error');
            return;
        }
        setMsg(avatarMsg, 'saved', 'Saved!', 'success');
    }
    $('profileEdit').addEventListener('click', (e) => {
        const option = e.target.closest('.avatar-option');
        if (option && option.dataset.avatar !== profile.avatar) saveAvatar(option.dataset.avatar);
    });
    $('avatarClear').addEventListener('click', () => saveAvatar(null));

    // ---------- insígnias em destaque (até 5) ----------
    const badgeMsg = $('badgeMsg');
    function renderBadgePicker() {
        const box = $('badgePicker');
        box.textContent = '';
        const earned = earnedBadges();
        const chosen = shownBadges().map((b) => b.id);
        $('badgeCount').textContent = `${chosen.length}/${MAX_SHOWN}`;
        if (!earned.length) {
            const p = document.createElement('p');
            p.className = 'badge-empty';
            p.textContent = t('noBadges', 'No badges yet.');
            box.appendChild(p);
            return;
        }
        earned.forEach((badge) => {
            const on = chosen.includes(badge.id);
            const label = document.createElement('label');
            label.className = 'badge badge-choice';
            label.innerHTML = `<input type="checkbox"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${badge.icon}</svg><span><strong></strong><small></small></span>`;
            const input = label.querySelector('input');
            input.value = badge.id;
            input.checked = on;
            input.disabled = !on && chosen.length >= MAX_SHOWN;
            label.querySelector('strong').textContent = t(...badge.name);
            label.querySelector('small').textContent = t(...badge.desc);
            box.appendChild(label);
        });
    }
    renderBadgePicker();
    statsListeners.push(renderBadgePicker);
    document.addEventListener('site-language-changed', renderBadgePicker);

    $('badgePicker').addEventListener('change', async (e) => {
        if (e.target.type !== 'checkbox') return;
        // Mantém a ordem em que já estavam; a nova entra no fim
        const current = shownBadges().map((b) => b.id).filter((id) => id !== e.target.value);
        const next = e.target.checked ? [...current, e.target.value].slice(0, MAX_SHOWN) : current;
        const previous = profile.shown_badges;
        profile.shown_badges = next;
        renderBadges();
        renderBadgePicker();
        setMsg(badgeMsg, 'saving', 'Saving...');
        const { error } = await client.from('profiles').update({ shown_badges: next }).eq('id', me.id);
        if (error) {
            console.warn('[perfil]', error.code, error.message);
            profile.shown_badges = previous;
            renderBadges();
            renderBadgePicker();
            setMsg(badgeMsg, 'errGeneric', 'Something went wrong. Please try again.', 'error');
            return;
        }
        setMsg(badgeMsg, 'saved', 'Saved!', 'success');
    });

    // ---------- privacidade: lista de amigos pública ou não ----------
    const privacyMsg = $('privacyMsg');
    const friendsPublic = $('friendsPublic');
    if (typeof profile.friends_public === 'boolean') {
        friendsPublic.checked = profile.friends_public;
        friendsPublic.addEventListener('change', async () => {
            const value = friendsPublic.checked;
            setMsg(privacyMsg, 'saving', 'Saving...');
            const { error } = await client.from('profiles').update({ friends_public: value }).eq('id', me.id);
            if (error) {
                friendsPublic.checked = !value;
                setMsg(privacyMsg, 'errGeneric', 'Something went wrong. Please try again.', 'error');
                return;
            }
            profile.friends_public = value;
            setMsg(privacyMsg, 'saved', 'Saved!', 'success');
        });
    } else {
        friendsPublic.closest('.profile-block').hidden = true; // banco ainda sem o script 005
    }

    // ---------- privacidade: meu status (online / ocupado / não perturbe / oculto) ----------
    // O status escolhido é privado: só o dono lê (supabase/014_status_privado.sql)
    if (auth.presence) profile.presence_mode = await auth.presence.myMode().catch(() => null);
    if (typeof profile.presence_mode === 'string' && auth.presence) {
        $('statusPickerBox').appendChild(auth.presence.picker(profile.presence_mode, (saved) => {
            if (saved) { profile.presence_mode = saved; setMsg(privacyMsg, 'saved', 'Saved!', 'success'); }
            else setMsg(privacyMsg, 'errGeneric', 'Something went wrong. Please try again.', 'error');
        }));
    } else {
        $('statusRow').hidden = true; // banco ainda sem o script 013
    }

    // ---------- bio ----------
    const bioForm = $('bioForm');
    const bioInput = $('bioInput');
    const bioCount = $('bioCount');
    const bioMsg = $('bioMsg');
    bioInput.value = profile.bio;
    bioInput.placeholder = t('bioPlaceholder', 'Tell the other players a little about yourself...');
    const updateCount = () => { bioCount.textContent = bioInput.value.length; };
    updateCount();
    bioInput.addEventListener('input', () => { updateCount(); bioMsg.textContent = ''; });

    bioForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bio = bioInput.value.trim().slice(0, 280);
        const button = bioForm.querySelector('button[type="submit"]');
        button.disabled = true;
        const { error } = await client.from('profiles').update({ bio }).eq('id', me.id);
        button.disabled = false;
        if (error) {
            setMsg(bioMsg, 'errGeneric', 'Something went wrong. Please try again.', 'error');
            return;
        }
        profile.bio = bio;
        bioInput.value = bio;
        updateCount();
        render();
        setMsg(bioMsg, 'saved', 'Saved!', 'success');
    });

    // ---------- dados da conta (o banco só devolve a linha do próprio jogador) ----------
    $('profileEmail').textContent = me.email ?? '';
    const { data: priv } = await client.from('profiles_private').select('birth_date').eq('id', me.id).maybeSingle();
    const renderBirth = () => {
        if (!priv?.birth_date) return;
        const [y, m, d] = priv.birth_date.split('-').map(Number);
        $('profileBirth').textContent = new Date(y, m - 1, d).toLocaleDateString(lang());
    };
    renderBirth();
    document.addEventListener('site-language-changed', renderBirth);

    const accountMsg = $('accountMsg');
    if (params.has('senha')) accountMsg.textContent = t('passwordChanged', 'Password changed.');

    // Trocar senha: abre o "Esqueci a senha" do login, que tem o captcha (o link vai para o e-mail).
    $('changePassword').addEventListener('click', () => {
        window.location.href = 'login.html?esqueci=1';
    });

    $('logoutButton').addEventListener('click', async () => {
        await client.auth.signOut();
        window.location.replace('index.html');
    });

    // ---------- situação da conta (supabase/018_contas_seguranca.sql) ----------
    // Se o SQL ainda não rodou, my_account falha e os blocos novos ficam escondidos.
    let account = null;
    const errCode = (error) => String(error?.message || '').match(/EOR_[A-Z_]+/)?.[0];
    const longDate = (d) => new Date(d).toLocaleDateString(lang(), { day: 'numeric', month: 'long', year: 'numeric' });
    async function loadAccount() {
        const { data, error } = await client.rpc('my_account');
        account = error ? null : data;
        renderGuardian();
        renderNickRule();
        renderRecovery();
    }

    // Trocar o apelido (1 vez a cada 30 dias)
    const nickMsg = $('nickMsg');
    const NICK_ERRORS = {
        EOR_NICK_INVALID: ['nicknameInvalid', 'Invalid nickname. Use 3 to 20 letters or numbers, no spaces.'],
        EOR_NICK_TAKEN: ['nicknameTaken', 'This nickname is already taken.'],
        EOR_NICK_SAME: ['nickSame', 'That is already your nickname.'],
        EOR_NICK_COOLDOWN: ['nickCooldown', 'You changed your nickname less than 30 days ago.']
    };
    function renderNickRule() {
        const next = account?.nickname_next_change;
        $('nickNext').hidden = !next;
        if (next) $('nickNext').textContent = `${t('nickNextChange', 'Next change allowed on')} ${longDate(next)}.`;
    }
    $('nickInput').value = profile.nickname;
    $('nickForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const value = $('nickInput').value.trim();
        if (!auth.NICK_RE.test(value)) { setMsg(nickMsg, ...NICK_ERRORS.EOR_NICK_INVALID, 'error'); return; }
        if (value === profile.nickname) { setMsg(nickMsg, ...NICK_ERRORS.EOR_NICK_SAME, 'error'); return; }
        if (!window.confirm(t('nickConfirm', 'Change your nickname to "{nick}"? You can only change it again in 30 days.').replace('{nick}', value))) return;
        const button = e.submitter || $('nickForm').querySelector('button');
        button.disabled = true;
        const { data, error } = await client.rpc('change_nickname', { p_new: value });
        button.disabled = false;
        if (error) {
            const code = errCode(error);
            const pair = NICK_ERRORS[code] || auth.friendError(error);
            setMsg(nickMsg, pair[0], pair[1], 'error');
            return;
        }
        // o endereço do perfil e o nome do topo mudam junto
        if (data?.nickname) window.location.replace('perfil.html?apelido=1#editar');
    });
    if (params.has('apelido')) setMsg(nickMsg, 'nickChanged', 'Nickname changed!', 'success');

    // Trocar o e-mail: o Supabase manda os links de confirmação
    const emailMsg = $('emailMsg');
    $('emailForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const value = $('emailInput').value.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(value)) { setMsg(emailMsg, 'invalidEmail', 'Invalid email.', 'error'); return; }
        if (value === String(me.email || '').toLowerCase()) { setMsg(emailMsg, 'emailSame', 'That is already your email.', 'error'); return; }
        const button = e.submitter || $('emailForm').querySelector('button');
        button.disabled = true;
        const { error } = await client.auth.updateUser({ email: value }, { emailRedirectTo: auth.siteUrl('perfil.html?email=1#editar') });
        button.disabled = false;
        if (error) {
            console.warn('[conta]', error.status, error.code, error.message);
            const taken = error.code === 'email_exists' || /already/i.test(error.message || '');
            const limited = error.status === 429 || String(error.code || '').startsWith('over_');
            setMsg(emailMsg, taken ? 'emailTaken' : limited ? 'errRateLimit' : 'errGeneric',
                taken ? 'This email already belongs to another account.' : limited ? 'Too many attempts. Please wait a few minutes and try again.' : 'Something went wrong. Please try again.', 'error');
            return;
        }
        $('emailInput').value = '';
        setMsg(emailMsg, 'emailChangeSent', 'Done! Open the confirmation links we sent by email to finish the change.', 'success');
    });
    if (params.has('email')) {
        $('emailChange').open = true;
        setMsg(emailMsg, 'emailChangeConfirmed', 'Email confirmed. If you were asked to confirm on both addresses, the change finishes after the second link.', 'success');
    }

    // Responsável (16/17 anos)
    const guardianMsg = $('guardianMsg');
    function renderGuardian() {
        const g = account?.guardian;
        $('responsavel').hidden = !g || g.status === 'approved';
        if (!g) return;
        if (g.email && !$('guardianInput').value) $('guardianInput').value = g.email;
        let state;
        if (g.status === 'denied') {
            state = t('guardianNoticeDeniedText', 'The account will be deleted within 24 hours. When you turn 18, you can create a new one.');
            $('guardianForm').hidden = true;
        } else if (g.sent_at) {
            state = `${t('guardianSentAt', 'Request sent to {email} on').replace('{email}', g.email || '')} ${new Date(g.sent_at).toLocaleString(lang())}. ${t('guardianWaiting', 'Until your guardian approves, you can browse but cannot post, comment or send messages.')}`;
        } else {
            state = t('guardianNotSent', 'The request has not been sent yet. Check the email below and send it.');
        }
        $('guardianState').textContent = state;
    }
    const GUARDIAN_ERRORS = {
        EOR_GUARDIAN_EMAIL: ['guardianEmailInvalid', 'Enter a valid email for your parent or guardian (different from yours).'],
        EOR_WAIT: ['guardianWait', 'Wait 10 minutes before sending another request.'],
        EOR_TOO_MANY: ['guardianTooMany', 'You reached 5 requests today. Try again tomorrow.'],
        EOR_GUARDIAN_DENIED: ['guardianNoticeDenied', 'Your guardian did not approve your account']
    };
    $('guardianForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const value = $('guardianInput').value.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(value) || value === String(me.email || '').toLowerCase()) {
            setMsg(guardianMsg, ...GUARDIAN_ERRORS.EOR_GUARDIAN_EMAIL, 'error');
            return;
        }
        const button = e.submitter || $('guardianForm').querySelector('button');
        button.disabled = true;
        const { error } = await client.rpc('guardian_send', { p_email: value });
        button.disabled = false;
        if (error) {
            const pair = GUARDIAN_ERRORS[errCode(error)] || ['errGeneric', 'Something went wrong. Please try again.'];
            setMsg(guardianMsg, pair[0], pair[1], 'error');
            return;
        }
        setMsg(guardianMsg, 'guardianSent', 'Request sent! Ask your guardian to check their inbox (and spam).', 'success');
        loadAccount();
    });

    // Código de recuperação: aparece uma vez só
    const recoveryMsg = $('recoveryMsg');
    function renderRecovery() {
        const r = account?.recovery;
        $('recuperacao').hidden = !account;
        if (!r) return;
        $('recoveryState').textContent = r.has_code
            ? `${t('recoveryHasCode', 'You created your code on')} ${longDate(r.created_at)}. ${t('recoveryReplaceHint', 'Lost it? Create a new one: the old code stops working.')}`
            : t('recoveryNone', 'You have not created a recovery code yet.');
        $('recoveryCreate').textContent = r.has_code ? t('recoveryReplace', 'Create a new code') : t('recoveryCreate', 'Create recovery code');
    }
    $('recoveryCreate').addEventListener('click', async () => {
        if (account?.recovery?.has_code
            && !window.confirm(t('recoveryReplaceConfirm', 'Create a new code? The old one stops working right away.'))) return;
        $('recoveryCreate').disabled = true;
        setMsg(recoveryMsg, null);
        const { data, error } = await client.rpc('recovery_code_create');
        $('recoveryCreate').disabled = false;
        if (error) {
            if (errCode(error) === 'EOR_REAUTH') {
                recoveryMsg.dataset.kind = 'error';
                recoveryMsg.textContent = `${t('recoveryReauth', 'To replace an existing code, sign in again first (your last sign-in was more than 15 minutes ago).')} `;
                const again = document.createElement('button');
                again.type = 'button';
                again.className = 'small-link link-button';
                again.textContent = t('deleteRelogin', 'Sign in again');
                again.addEventListener('click', async () => {
                    await client.auth.signOut();
                    window.location.href = 'login.html?volta=recuperacao';
                });
                recoveryMsg.appendChild(again);
                return;
            }
            const pair = auth.friendError(error);
            setMsg(recoveryMsg, pair[0], pair[1], 'error');
            return;
        }
        $('recoveryCode').textContent = data;
        $('recoveryShow').hidden = false;
        setMsg(recoveryMsg, 'recoveryCreated', 'Code created. Save it before leaving this page.', 'success');
        loadAccount();
    });
    $('recoveryCopy').addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText($('recoveryCode').textContent);
            setMsg(recoveryMsg, 'recoveryCopied', 'Copied!', 'success');
        } catch {
            setMsg(recoveryMsg, 'recoveryCopyFail', 'Could not copy. Select the code and copy it by hand.', 'error');
        }
    });
    $('recoveryDownload').addEventListener('click', () => {
        const text = [
            'Empire of Rebirth & Ruins',
            `${t('recoveryTitle', 'Recovery code')}: ${$('recoveryCode').textContent}`,
            `${t('nickname', 'Nickname')}: ${profile.nickname}`,
            `${t('recoveryFileDate', 'Created on')}: ${new Date().toLocaleString(lang())}`,
            '',
            t('recoveryFileHelp', 'To use it: login page → Forgot password? → Lost access to your email? Use your recovery code.'),
            t('recoveryFileWarn', 'Anyone who has this code can take over your account. Keep it safe.')
        ].join('\r\n');
        const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'empire-codigo-de-recuperacao.txt';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    document.addEventListener('site-language-changed', () => { renderGuardian(); renderNickRule(); renderRecovery(); });
    loadAccount();

    // ---------- privacidade e dados (supabase/017_dados_conta.sql) ----------
    // Versão dos termos aceita
    let privacy = null;
    const versionText = (v) => {
        const [y, m, d] = String(v).split('-').map(Number);
        return y && m && d ? new Date(y, m - 1, d).toLocaleDateString(lang(), { day: 'numeric', month: 'long', year: 'numeric' }) : v;
    };
    const renderAccepted = () => {
        if (!privacy?.terms_version) return;
        let text = `${t('termsAcceptedLabel', 'You accepted the version of')} ${versionText(privacy.terms_version)}`;
        if (privacy.terms_accepted_at) text += ` ${t('termsAcceptedOn', 'on')} ${new Date(privacy.terms_accepted_at).toLocaleDateString(lang())}`;
        text += '.';
        if (privacy.current_version && privacy.terms_version !== privacy.current_version) {
            text += ` ${t('termsNewWaiting', 'A new version is waiting for your agreement (notice at the bottom of the screen).')}`;
        }
        $('termsAccepted').textContent = text;
    };
    client.rpc('my_privacy').then(({ data }) => { privacy = data; renderAccepted(); });
    document.addEventListener('site-language-changed', renderAccepted);

    // Baixar meus dados (my_data_export, supabase/018_contas_seguranca.sql)
    const exportMsg = $('exportMsg');
    $('exportData').addEventListener('click', async () => {
        $('exportData').disabled = true;
        setMsg(exportMsg, 'exportWorking', 'Preparing the file...', 'info');
        const { data, error } = await client.rpc('my_data_export');
        $('exportData').disabled = false;
        if (error || !data) {
            const pair = error ? auth.friendError(error) : ['errGeneric', 'Something went wrong. Please try again.'];
            setMsg(exportMsg, pair[0], pair[1], 'error');
            return;
        }
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `empire-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMsg(exportMsg, 'exportDone', 'Done! The file was downloaded.', 'success');
    });

    // Excluir conta: 1) confere login recente  2) apaga as imagens pela API  3) o banco apaga a conta
    const deleteMsg = $('deleteMsg');
    const deleteInput = $('deleteConfirm');
    const deleteSubmit = $('deleteSubmit');
    $('deleteNick').textContent = profile.nickname;
    const DELETE_ERRORS = {
        EOR_REAUTH: ['deleteErrReauth', 'Your sign-in is no longer recent. Sign in again and try once more.'],
        EOR_CONFIRM: ['deleteErrConfirm', 'The nickname does not match.'],
        EOR_IMAGES_LEFT: ['deleteErrImages', 'Some images could not be deleted. Try again.'],
        EOR_MFA: ['errNeedMfa', 'Confirm your two-step code to continue.'],
        EOR_PROTECTED: ['deleteAdmin', 'Admin accounts cannot be deleted from the site.'],
        EOR_BANNED: ['deleteBanned', 'While your account is suspended or banned, it cannot be deleted.']
    };
    const deleteError = (error) => {
        const code = String(error?.message || '').match(/EOR_[A-Z_]+/)?.[0];
        if (code === 'EOR_REAUTH') checkDeletion();
        return DELETE_ERRORS[code] || ['errGeneric', 'Something went wrong. Please try again.'];
    };

    async function checkDeletion() {
        const { data, error } = await client.rpc('account_deletion_check');
        if (error) { setMsg(deleteMsg, 'errGeneric', 'Something went wrong. Please try again.', 'error'); return null; }
        const blocked = data.is_admin || data.banned === true;
        $('deleteAdmin').hidden = !data.is_admin;
        $('deleteBanned').hidden = data.is_admin || data.banned !== true;
        $('deleteReauth').hidden = blocked || data.recent_login;
        $('deleteForm').hidden = blocked || !data.recent_login;
        return data;
    }
    async function openDeletion() {
        const panel = $('deletePanel');
        panel.hidden = false;
        $('deleteOpen').setAttribute('aria-expanded', 'true');
        await checkDeletion();
    }
    $('deleteOpen').setAttribute('aria-expanded', 'false');
    $('deleteOpen').addEventListener('click', () => {
        if ($('deletePanel').hidden) openDeletion();
        else {
            $('deletePanel').hidden = true;
            $('deleteOpen').setAttribute('aria-expanded', 'false');
        }
    });
    $('deleteRelogin').addEventListener('click', async () => {
        await client.auth.signOut();
        window.location.href = 'login.html?volta=excluir';
    });
    deleteInput.addEventListener('input', () => {
        deleteSubmit.disabled = deleteInput.value.trim().toLowerCase() !== profile.nickname.toLowerCase();
    });
    $('deleteForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (deleteSubmit.disabled) return;
        if (!window.confirm(t('deleteFinalConfirm', 'Last step: delete your account forever? This cannot be undone.'))) return;
        deleteSubmit.disabled = true;
        deleteInput.disabled = true;
        const fail = (pair) => {
            setMsg(deleteMsg, pair[0], pair[1], 'error');
            deleteInput.disabled = false;
            deleteSubmit.disabled = false;
        };
        // 1) ainda pode? (evita apagar as imagens e depois o banco recusar)
        const check = await checkDeletion();
        if (check?.banned) { fail(DELETE_ERRORS.EOR_BANNED); return; }
        if (!check || check.is_admin || !check.recent_login) { fail(DELETE_ERRORS.EOR_REAUTH); return; }
        // 2) imagens (só a API de armazenamento apaga os arquivos de verdade)
        setMsg(deleteMsg, 'deleteWorking', 'Deleting your images...', 'info');
        const bucket = client.storage.from('post-images');
        for (let round = 0; round < 50; round++) {
            const { data: files, error } = await bucket.list(me.id, { limit: 100 });
            if (error) { fail(DELETE_ERRORS.EOR_IMAGES_LEFT); return; }
            if (!files?.length) break;
            const { error: rmError } = await bucket.remove(files.map((f) => `${me.id}/${f.name}`));
            if (rmError) { fail(DELETE_ERRORS.EOR_IMAGES_LEFT); return; }
        }
        // 3) conta
        setMsg(deleteMsg, 'deleteWorkingAccount', 'Deleting your account...', 'info');
        const { error } = await client.rpc('delete_my_account', { p_confirm: deleteInput.value.trim() });
        if (error) { fail(deleteError(error)); return; }
        await client.auth.signOut({ scope: 'local' }).catch(() => {});
        try { sessionStorage.removeItem('eor-chat'); } catch { /* sem armazenamento */ }
        window.location.replace('index.html?conta=excluida');
    });
    // Links diretos para um bloco do Editar perfil (rodapé, avisos do topo)
    const goToSection = () => {
        const hash = window.location.hash;
        if (!['#excluir-conta', '#recuperacao', '#responsavel'].includes(hash)) return;
        setEditing(true, false);
        window.history.replaceState(null, '', `${window.location.pathname}${hash}`);
        const target = $(hash.slice(1));
        if (hash === '#excluir-conta') openDeletion().then(() => target.scrollIntoView({ block: 'start' }));
        else setTimeout(() => target.scrollIntoView({ block: 'start' }), 300);  // depois do my_account
    };
    goToSection();
    window.addEventListener('hashchange', () => {
        // "Editar perfil" do menu do topo, com o perfil já aberto
        if (['#editar', '#configuracoes'].includes(window.location.hash)) setEditing(true);
        else goToSection();
    });

    // ---------- verificação em duas etapas (opcional) ----------
    const mfaMsg = $('mfaMsg');
    const setMfaMsg = (key, fallback, kind = 'info') => setMsg(mfaMsg, key, fallback, kind);
    let pendingFactor = null;

    function mfaState(state) {
        ['mfaOff', 'mfaSetup', 'mfaOn'].forEach((id) => { $(id).hidden = id !== state; });
    }

    async function loadMfa() {
        const { data, error } = await client.auth.mfa.listFactors();
        if (error) return;
        $('mfaBlock').hidden = false;
        mfaState(data?.totp?.length ? 'mfaOn' : 'mfaOff');
    }
    await loadMfa();

    $('mfaStart').addEventListener('click', async (e) => {
        const button = e.currentTarget; // depois de um "await" o evento perde o currentTarget
        setMfaMsg('');
        button.disabled = true;
        // Remove tentativas antigas não concluídas
        const { data: existing } = await client.auth.mfa.listFactors();
        for (const factor of existing?.all ?? []) {
            if (factor.status !== 'verified') await client.auth.mfa.unenroll({ factorId: factor.id });
        }
        const { data, error } = await client.auth.mfa.enroll({
            factorType: 'totp',
            friendlyName: 'Autenticador',
            issuer: 'Empire of Rebirth & Ruins'
        });
        button.disabled = false;
        if (error || !data) {
            console.warn('[2fa]', error?.status, error?.code, error?.message);
            setMfaMsg('errGeneric', 'Something went wrong. Please try again.', 'error');
            return;
        }
        pendingFactor = data.id;
        $('mfaQr').src = data.totp.qr_code;
        $('mfaSecret').textContent = data.totp.secret;
        $('mfaSetupCode').value = '';
        mfaState('mfaSetup');
        $('mfaSetupCode').focus();
    });

    $('mfaConfirmForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const button = e.currentTarget.querySelector('button[type="submit"]');
        const code = $('mfaSetupCode').value.replace(/\D/g, '');
        if (code.length !== 6 || !pendingFactor) {
            setMfaMsg('mfaInvalid', 'Invalid code. Check the app and try again.', 'error');
            return;
        }
        button.disabled = true;
        const { error } = await client.auth.mfa.challengeAndVerify({ factorId: pendingFactor, code });
        button.disabled = false;
        if (error) {
            console.warn('[2fa]', error.status, error.code, error.message);
            setMfaMsg('mfaInvalid', 'Invalid code. Check the app and try again.', 'error');
            return;
        }
        pendingFactor = null;
        mfaState('mfaOn');
        setMfaMsg('mfaEnabledMsg', 'Two-step verification is on. Keep your app safe: you will need it to sign in.', 'success');
    });

    $('mfaCancelSetup').addEventListener('click', async () => {
        if (pendingFactor) await client.auth.mfa.unenroll({ factorId: pendingFactor });
        pendingFactor = null;
        setMfaMsg('');
        mfaState('mfaOff');
    });

    $('mfaDisable').addEventListener('click', async (e) => {
        const button = e.currentTarget;
        if (!window.confirm(t('mfaDisableConfirm', 'Turn off two-step verification? Your account will be protected only by your password.'))) return;
        button.disabled = true;
        const { data } = await client.auth.mfa.listFactors();
        let failed = false;
        for (const factor of data?.all ?? []) {
            const { error } = await client.auth.mfa.unenroll({ factorId: factor.id });
            if (error) { failed = true; console.warn('[2fa]', error.status, error.code, error.message); }
        }
        button.disabled = false;
        if (failed) {
            setMfaMsg('errGeneric', 'Something went wrong. Please try again.', 'error');
            return;
        }
        await client.auth.refreshSession();
        mfaState('mfaOff');
        setMfaMsg('mfaDisabledMsg', 'Two-step verification is off.', 'info');
    });
});
