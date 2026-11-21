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
        if (!me) { show('profileGuest'); return; }
        const { data, error } = await fetchProfile((q) => q.eq('id', me.id).maybeSingle());
        if (error || !data) { show('profileMissing'); return; }
        profile = data;
    }

    const isOwner = !!me && me.id === profile.id;

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
        $('friendsCard').hidden = false;
        $('friendsTotal').textContent = friends.total ? `(${friends.total})` : '';
        const list = $('friendList');
        list.textContent = '';
        // Poucos amigos no quadro: 6 no computador, 3 no celular. O resto em "Ver todos".
        const limit = friendsExpanded ? Infinity : (mobile.matches ? 3 : 6);
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
    function renderFriendAction() {
        if (!friendState) return;
        const main = $('friendMain');
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
            const { data, error } = await client.rpc('friendship_status', { p_nick: profile.nickname });
            if (!error) {
                friendState = data || 'none';
                renderFriendAction();
            }
        }
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
