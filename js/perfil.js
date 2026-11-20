// Perfil do jogador.
//   perfil.html          → o seu perfil (precisa estar logado)
//   perfil.html?n=Apelido → perfil público de outro jogador
// Tudo que vem do banco entra na página como TEXTO (textContent), nunca como HTML.
document.addEventListener('DOMContentLoaded', async () => {
    const t = (key, fallback) => (window.getSiteTranslation ? window.getSiteTranslation(key, fallback) : fallback);
    const $ = (id) => document.getElementById(id);
    const auth = window.EorAuth;
    const status = $('profileStatus');

    function show(id) {
        status.hidden = true;
        $(id).hidden = false;
    }

    if (!auth) {
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
    let profile = null;
    if (wanted) {
        if (!auth.NICK_RE.test(wanted)) { show('profileMissing'); return; }
        // ilike sem curingas: escapa _ e % para buscar o apelido exato (sem diferenciar maiúsculas)
        const pattern = wanted.replace(/[\\%_]/g, (c) => `\\${c}`);
        const { data, error } = await client.from('profiles').select('id, nickname, bio, created_at').ilike('nickname', pattern).maybeSingle();
        if (error || !data) { show('profileMissing'); return; }
        profile = data;
    } else {
        if (!me) { show('profileGuest'); return; }
        const { data, error } = await client.from('profiles').select('id, nickname, bio, created_at').eq('id', me.id).maybeSingle();
        if (error || !data) { show('profileMissing'); return; }
        profile = data;
    }

    const isOwner = !!me && me.id === profile.id;

    function render() {
        $('profileInitial').textContent = profile.nickname.charAt(0).toUpperCase();
        $('profileName').textContent = profile.nickname;
        $('profileSince').textContent = fmtDate(profile.created_at, { month: 'long', year: 'numeric' });
        $('profileSince').dateTime = profile.created_at;
        $('profileBio').textContent = profile.bio;
        $('profileBio').hidden = !profile.bio || isOwner;
        $('profileBioEmpty').hidden = !!profile.bio || isOwner;
        document.title = `${profile.nickname} · Empire of Rebirth & Ruins`;
    }
    render();
    show('profileCard');
    document.addEventListener('site-language-changed', render);

    if (!isOwner) return;

    // ---------- área do dono ----------
    const bioForm = $('bioForm');
    const bioInput = $('bioInput');
    const bioCount = $('bioCount');
    const bioMsg = $('bioMsg');
    bioForm.hidden = false;
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
            bioMsg.dataset.kind = 'error';
            bioMsg.textContent = t('errGeneric', 'Something went wrong. Please try again.');
            return;
        }
        profile.bio = bio;
        bioInput.value = bio;
        updateCount();
        bioMsg.dataset.kind = 'success';
        bioMsg.textContent = t('saved', 'Saved!');
    });

    // Dados privados (o banco só devolve a linha do próprio jogador)
    $('profilePrivate').hidden = false;
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

    // Trocar senha = link no e-mail (quem roubar a sessão não troca a senha sem o e-mail)
    // Abre o "Esqueci a senha" do login, que tem o captcha.
    $('changePassword').addEventListener('click', () => {
        window.location.href = 'login.html?esqueci=1';
    });

    $('logoutButton').addEventListener('click', async () => {
        await client.auth.signOut();
        window.location.replace('index.html');
    });

    // ---------- verificação em duas etapas (opcional) ----------
    const mfaMsg = $('mfaMsg');
    const setMfaMsg = (key, fallback, kind = 'info') => {
        mfaMsg.dataset.kind = kind;
        mfaMsg.textContent = key ? t(key, fallback) : '';
    };
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
        const code = $('mfaSetupCode').value.replace(/\D/g, '');
        if (code.length !== 6 || !pendingFactor) {
            setMfaMsg('mfaInvalid', 'Invalid code. Check the app and try again.', 'error');
            return;
        }
        const button = e.currentTarget.querySelector('button[type="submit"]');
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
