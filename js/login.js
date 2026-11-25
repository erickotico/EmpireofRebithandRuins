// Página de login: entrar, criar conta, esqueci a senha e nova senha.
// Toda regra importante (idade, apelido, termos) também é checada no banco;
// aqui ela existe só para dar a mensagem certa ao jogador.
document.addEventListener('DOMContentLoaded', () => {
    const translate = (key, fallback) => typeof window.getSiteTranslation === 'function'
        ? window.getSiteTranslation(key, fallback)
        : fallback;
    document.querySelectorAll('.auth-year').forEach((el) => { el.textContent = new Date().getFullYear(); });

    const auth = window.EorAuth;
    const notice = document.getElementById('authNotice');
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const wantsReset = params.has('reset');
    // perfil.html → "Trocar senha" abre direto o "Esqueci a senha" (com captcha), mesmo logado
    const wantsForgot = params.has('esqueci');

    // ---------- mensagens ----------
    function showNotice(key, fallback, kind = 'info', vars = {}) {
        if (!notice) return;
        let text = translate(key, fallback);
        Object.entries(vars).forEach(([k, v]) => { text = text.replace(`{${k}}`, v); });
        notice.textContent = text;
        notice.dataset.kind = kind;
        notice.hidden = false;
    }
    function hideNotice() { if (notice) notice.hidden = true; }
    function setError(form, field, key, fallback) {
        const el = form.querySelector(`[data-for="${field}"]`);
        if (el) el.textContent = key ? translate(key, fallback) : '';
    }
    function clearErrors(form) {
        form.querySelectorAll('.form-error').forEach((el) => { el.textContent = ''; });
    }
    function busy(button, on, key, fallback) {
        if (!button) return;
        if (on) {
            button.dataset.label = button.textContent;
            button.textContent = translate(key, fallback);
        } else if (button.dataset.label) {
            button.textContent = translate(button.dataset.i18n, button.dataset.label);
        }
        button.disabled = on;
    }

    // Mesma regra configurada no Supabase: 8+ caracteres com minúscula, MAIÚSCULA, número e símbolo
    function strongPassword(value) {
        return value.length >= 8 && /[a-z]/.test(value) && /[A-Z]/.test(value)
            && /\d/.test(value) && /[^A-Za-z0-9\s]/.test(value);
    }

    // Erros do Supabase → mensagens do site
    function errorKey(error) {
        const code = error?.code || '';
        const status = error?.status;
        // Detalhe técnico no console (F12) para diagnosticar; o jogador vê só a mensagem amigável
        console.warn('[conta]', status, code, error?.message);
        // Recusas do próprio banco (supabase/001_contas_v1.sql)
        const reason = String(error?.message || '').match(/EOR_[A-Z_]+/)?.[0];
        if (reason === 'EOR_UNDERAGE') return ['underAge', 'You must be 16 or older to create an account.'];
        if (reason === 'EOR_NICK_TAKEN') return ['nicknameTaken', 'This nickname is already taken.'];
        if (reason === 'EOR_NICK_INVALID') return ['nicknameInvalid', 'Invalid nickname. Check the rules above.'];
        if (reason === 'EOR_BIRTH_INVALID') return ['invalidBirthDate', 'Invalid date of birth.'];
        if (reason === 'EOR_TERMS') return ['acceptTerms', 'You must accept the terms.'];
        if (reason === 'EOR_GUARDIAN_EMAIL') return ['guardianEmailInvalid', 'Enter a valid email for your parent or guardian (different from yours).'];
        if (reason === 'EOR_EMAIL_BLOCKED') return ['errSignupRejected', 'We could not create the account. Check your nickname and date of birth.'];
        if (code === 'captcha_failed' || /captcha/i.test(error?.message || '')) return ['captchaFailed', 'The robot check failed. Please try again.'];
        if (code === 'invalid_credentials') return ['errInvalidLogin', 'Incorrect email or password.'];
        if (code === 'email_not_confirmed') return ['errNotConfirmed', 'Confirm your email first. Check your inbox (and spam).'];
        if (code.startsWith('over_') || status === 429) return ['errRateLimit', 'Too many attempts. Please wait a few minutes and try again.'];
        if (code === 'weak_password') return ['errWeakPassword', 'This password is too weak. Use at least 8 characters, mixing letters and numbers.'];
        if (code === 'same_password') return ['errSamePassword', 'The new password must be different from the old one.'];
        // Falha do serviço de e-mail (SMTP), não do endereço digitado
        if (status >= 500 && /send|mail|smtp/i.test(error?.message || '')) return ['errEmailSend', 'We could not send the email right now. Please try again in a few minutes.'];
        if (code === 'email_address_invalid') return ['invalidEmail', 'Invalid email.'];
        if (code === 'email_address_not_authorized') return ['errEmailNotAllowed', 'We cannot send emails to this address yet. Please try again later.'];
        if (code === 'unexpected_failure' || /database error/i.test(error?.message || '')) return ['errSignupRejected', 'We could not create the account. Check your nickname and date of birth.'];
        if (!navigator.onLine || /fetch/i.test(error?.message || '')) return ['errNetwork', 'Connection failed. Check your internet and try again.'];
        return ['errGeneric', 'Something went wrong. Please try again.'];
    }

    if (!auth) {
        showNotice('errNetwork', 'Connection failed. Check your internet and try again.', 'error');
        return;
    }
    const { client } = auth;

    // ---------- captcha (Cloudflare Turnstile) ----------
    // Um widget por formulário. Cada token vale para UMA tentativa: depois de usar, reseta.
    const captcha = {};
    function renderCaptcha(name) {
        const box = document.querySelector(`[data-captcha="${name}"]`);
        if (!box || captcha[name]) return;
        captcha[name] = { id: null, token: null };
        const draw = () => {
            if (!window.turnstile) { setTimeout(draw, 200); return; }
            captcha[name].id = window.turnstile.render(box, {
                sitekey: auth.TURNSTILE_SITE_KEY,
                theme: 'dark',
                size: 'flexible',
                language: window.SiteI18n?.lang === 'pt' ? 'pt-br' : 'en',
                callback: (token) => { captcha[name].token = token; },
                'expired-callback': () => { captcha[name].token = null; },
                'error-callback': () => {
                    captcha[name].token = null;
                    // Normalmente é bloqueador de anúncios/rastreadores (ex.: Brave Shields)
                    const form = box.closest('form');
                    if (form) setError(form, name, 'captchaBlocked', 'The robot check could not load. If you use an ad or tracker blocker (e.g. Brave Shields), turn it off for this site and reload.');
                }
            });
        };
        draw();
    }
    function captchaToken(name) {
        return captcha[name]?.token || null;
    }
    function resetCaptcha(name) {
        const entry = captcha[name];
        if (!entry) return;
        entry.token = null;
        if (window.turnstile && entry.id !== null) window.turnstile.reset(entry.id);
    }
    renderCaptcha('login');

    // ---------- trocar de tela (entrar / esqueci / nova senha) ----------
    const views = document.querySelectorAll('[data-view]');
    function showView(name) {
        views.forEach((view) => { view.hidden = view.dataset.view !== name; });
        if (name === 'forgot') renderCaptcha('forgot');
        if (name === 'recover') renderCaptcha('recover');
        const first = document.querySelector(`[data-view="${name}"] input`);
        first?.focus();
    }
    document.querySelectorAll('[data-goto]').forEach((button) => {
        button.addEventListener('click', () => {
            hideNotice();
            const typed = document.getElementById('loginEmail')?.value.trim();
            if (button.dataset.goto === 'forgot') {
                const target = document.getElementById('forgotEmail');
                if (typed && typed.includes('@') && target && !target.value) target.value = typed;
            }
            if (button.dataset.goto === 'recover') {
                const target = document.getElementById('recoverLogin');
                if (typed && target && !target.value) target.value = typed;
            }
            showView(button.dataset.goto);
        });
    });

    // ---------- mostrar / esconder senha ----------
    const togglePassword = document.querySelector('.toggle-password');
    const password = document.getElementById('password');
    const eyeIcon = document.querySelector('.eye-icon');
    togglePassword?.addEventListener('click', () => {
        if (!password) return;
        const type = password.type === 'password' ? 'text' : 'password';
        password.type = type;
        if (eyeIcon) eyeIcon.src = type === 'text' ? './img/icons/opened-eye.png' : './img/icons/closed-eye.png';
    });

    // ---------- sessão / links do e-mail ----------
    let handled = false;
    const errorCode = params.get('error_code') || hashParams.get('error_code');
    if (errorCode) {
        handled = true;
        if (wantsReset) showView('forgot');
        showNotice('errLinkExpired', 'This link has expired or was already used. Request a new one.', 'error');
        window.history.replaceState(null, '', window.location.pathname);
    }

    // ---------- verificação em duas etapas ----------
    // Quem ativou o app autenticador entra primeiro com a senha (sessão "aal1")
    // e só completa o login digitando o código (sessão "aal2").
    let afterMfa = 'profile';
    async function needsMfa() {
        const { data } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        return !!data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
    }
    // ?volta=...: veio de um bloco do Editar perfil que pede login (excluir conta, código de recuperação)
    function afterLoginPage() {
        const back = { excluir: 'perfil.html#excluir-conta', recuperacao: 'perfil.html#recuperacao', responsavel: 'perfil.html#responsavel' };
        return back[params.get('volta')] || 'perfil.html';
    }
    async function continueAfterLogin(next = 'profile') {
        if (await needsMfa()) {
            afterMfa = next;
            hideNotice();
            showView('mfa');
            return;
        }
        if (next === 'reset') showView('reset');
        else window.location.replace(afterLoginPage());
    }

    // Os tratadores rodam fora do callback (o Supabase não deixa chamar a API dentro dele)
    client.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
            handled = true;
            setTimeout(() => continueAfterLogin('reset'), 0);
            return;
        }
        if (handled || !session) return;
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
            handled = true;
            // Já está logado (ou acabou de confirmar o e-mail) → perfil (ou código 2FA)
            setTimeout(() => continueAfterLogin(wantsReset ? 'reset' : 'profile'), 0);
        }
    });

    const mfaForm = document.getElementById('mfaForm');
    mfaForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors(mfaForm);
        const code = mfaForm.code.value.replace(/\D/g, '');
        if (code.length !== 6) {
            setError(mfaForm, 'mfa', 'mfaInvalid', 'Invalid code. Check the app and try again.');
            return;
        }
        const button = mfaForm.querySelector('button[type="submit"]');
        busy(button, true, 'verifying', 'Verifying...');
        const { data: factors, error: listError } = await client.auth.mfa.listFactors();
        const factor = factors?.totp?.[0];
        if (listError || !factor) {
            busy(button, false);
            setError(mfaForm, 'mfa', 'errGeneric', 'Something went wrong. Please try again.');
            return;
        }
        const { error } = await client.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
        busy(button, false);
        if (error) {
            console.warn('[conta]', error.status, error.code, error.message);
            mfaForm.code.value = '';
            const tooMany = error.status === 429 || String(error.code || '').startsWith('over_');
            setError(mfaForm, 'mfa', tooMany ? 'errRateLimit' : 'mfaInvalid',
                tooMany ? 'Too many attempts. Please wait a few minutes and try again.' : 'Invalid code. Check the app and try again.');
            return;
        }
        if (afterMfa === 'reset') showView('reset');
        else window.location.replace(afterLoginPage());
    });
    document.getElementById('mfaCancel')?.addEventListener('click', async () => {
        await client.auth.signOut();
        window.location.replace('login.html');
    });

    if (wantsForgot && !errorCode) {
        handled = true;
        showView('forgot');
    }

    if (params.has('confirmed') && !errorCode) {
        showNotice('accountConfirmed', 'Email confirmed! You can sign in now.', 'success');
    }

    // ---------- entrar ----------
    const loginForm = document.getElementById('loginForm');
    loginForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors(loginForm);
        hideNotice();
        const identifier = loginForm.email.value.trim();
        const pass = loginForm.password.value;
        if (!identifier || !pass) {
            setError(loginForm, 'login', 'errFillLogin', 'Enter your email (or nickname) and password.');
            return;
        }
        const byEmail = identifier.includes('@');
        if (!byEmail && !auth.NICK_RE.test(identifier)) {
            setError(loginForm, 'login', 'errInvalidLogin', 'Incorrect email/nickname or password.');
            return;
        }
        const loginToken = captchaToken('login');
        if (!loginToken) {
            setError(loginForm, 'login', 'captchaRequired', 'Confirm you are not a robot.');
            return;
        }
        auth.setRemember(document.getElementById('rememberMe')?.checked ?? true);
        const button = loginForm.querySelector('button[type="submit"]');
        busy(button, true, 'signingIn', 'Signing in...');
        handled = true; // o redirecionamento é feito aqui embaixo
        const { error } = byEmail
            ? await client.auth.signInWithPassword({ email: identifier, password: pass, options: { captchaToken: loginToken } })
            : await signInWithNickname(identifier, pass, loginToken);
        resetCaptcha('login');
        if (error) {
            busy(button, false);
            handled = false;
            const [key, fallback] = errorKey(error);
            setError(loginForm, 'login', key, fallback);
            return;
        }
        await continueAfterLogin('profile');
        busy(button, false);
    });

    // Apelido + senha: o servidor (Edge Function "login-apelido") confere tudo e
    // devolve só um código de uso único, trocado aqui por uma sessão.
    async function signInWithNickname(nickname, pass, token) {
        let response;
        try {
            response = await fetch(`${auth.SUPABASE_URL}/functions/v1/login-apelido`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: auth.SUPABASE_KEY },
                body: JSON.stringify({ nickname, password: pass, captchaToken: token })
            });
        } catch {
            return { error: { message: 'fetch failed' } };
        }
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.token_hash) {
            const map = {
                invalid_credentials: 'invalid_credentials',
                captcha_failed: 'captcha_failed',
                too_many_attempts: 'over_request_rate_limit',
                email_not_confirmed: 'email_not_confirmed'
            };
            return { error: { status: response.status, code: map[body.error] || 'server_error', message: body.error || '' } };
        }
        const { error } = await client.auth.verifyOtp({ token_hash: body.token_hash, type: 'email' });
        return { error };
    }

    // ---------- esqueci a senha ----------
    const forgotForm = document.getElementById('forgotForm');
    forgotForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors(forgotForm);
        const email = forgotForm.email.value.trim();
        if (!/^\S+@\S+\.\S+$/.test(email)) {
            setError(forgotForm, 'forgot', 'invalidEmail', 'Invalid email.');
            return;
        }
        const forgotToken = captchaToken('forgot');
        if (!forgotToken) {
            setError(forgotForm, 'forgot', 'captchaRequired', 'Confirm you are not a robot.');
            return;
        }
        const button = forgotForm.querySelector('button[type="submit"]');
        busy(button, true, 'sending', 'Sending...');
        const { error } = await client.auth.resetPasswordForEmail(email, {
            redirectTo: auth.siteUrl('login.html?reset=1'),
            captchaToken: forgotToken
        });
        resetCaptcha('forgot');
        busy(button, false);
        if (error) {
            const [key, fallback] = errorKey(error);
            setError(forgotForm, 'forgot', key, fallback);
            return;
        }
        // Mesma mensagem exista ou não a conta (não revela quem é cadastrado)
        showView('login');
        showNotice('resetSent', 'If this email has an account, a link to create a new password is on its way. Check your inbox (and spam).', 'success');
    });

    // ---------- recuperar com o código ----------
    // O servidor (Edge Function "recuperar-conta") confere o código, encerra todas as
    // sessões, desliga a 2FA, troca o e-mail se pedido e devolve uma entrada de uso único.
    const recoverForm = document.getElementById('recoverForm');
    recoverForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors(recoverForm);
        hideNotice();
        const login = recoverForm.login.value.trim();
        const code = recoverForm.code.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        const newEmail = recoverForm.newEmail.value.trim();
        if (!login || code.length !== 16) {
            setError(recoverForm, 'recover', 'recoverInvalid', 'Nickname/email or recovery code is incorrect.');
            return;
        }
        if (newEmail && !/^\S+@\S+\.\S+$/.test(newEmail)) {
            setError(recoverForm, 'recover', 'invalidEmail', 'Invalid email.');
            return;
        }
        const token = captchaToken('recover');
        if (!token) {
            setError(recoverForm, 'recover', 'captchaRequired', 'Confirm you are not a robot.');
            return;
        }
        const button = recoverForm.querySelector('button[type="submit"]');
        busy(button, true, 'verifying', 'Verifying...');
        handled = true;
        let response = null;
        let body = {};
        try {
            response = await fetch(`${auth.SUPABASE_URL}/functions/v1/recuperar-conta`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: auth.SUPABASE_KEY },
                body: JSON.stringify({ login, code, newEmail, captchaToken: token })
            });
            body = await response.json().catch(() => ({}));
        } catch { /* sem conexão */ }
        resetCaptcha('recover');
        if (!response?.ok || !body.token_hash) {
            busy(button, false);
            handled = false;
            const map = {
                invalid_code: ['recoverInvalid', 'Nickname/email or recovery code is incorrect.'],
                too_many_attempts: ['errRateLimit', 'Too many attempts. Please wait a few minutes and try again.'],
                email_taken: ['recoverEmailTaken', 'This email already belongs to another account.'],
                invalid_email: ['invalidEmail', 'Invalid email.'],
                captcha_failed: ['captchaFailed', 'The robot check failed. Please try again.']
            };
            const [key, fallback] = !response
                ? ['errNetwork', 'Connection failed. Check your internet and try again.']
                : (map[body.error] || ['errGeneric', 'Something went wrong. Please try again.']);
            setError(recoverForm, 'recover', key, fallback);
            return;
        }
        auth.setRemember(false);
        const { error } = await client.auth.verifyOtp({ token_hash: body.token_hash, type: 'email' });
        busy(button, false);
        if (error) {
            handled = false;
            const [key, fallback] = errorKey(error);
            setError(recoverForm, 'recover', key, fallback);
            return;
        }
        recoverForm.reset();
        showView('reset');
        showNotice('recoverDone', 'Account recovered! Now choose a new password. Then create a new recovery code in Edit profile.', 'success');
    });

    // ---------- nova senha ----------
    const resetForm = document.getElementById('resetForm');
    resetForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors(resetForm);
        const p1 = resetForm.password.value;
        const p2 = resetForm.password2.value;
        if (!strongPassword(p1)) {
            setError(resetForm, 'reset', 'errWeakPassword', 'This password is too weak. Follow the rule below the field.');
            return;
        }
        if (p1 !== p2) {
            setError(resetForm, 'reset', 'passwordMismatch', 'The passwords do not match.');
            return;
        }
        const button = resetForm.querySelector('button[type="submit"]');
        busy(button, true, 'saving', 'Saving...');
        const { error } = await client.auth.updateUser({ password: p1 });
        busy(button, false);
        if (error) {
            const [key, fallback] = errorKey(error);
            setError(resetForm, 'reset', key, fallback);
            return;
        }
        window.history.replaceState(null, '', window.location.pathname);
        window.location.replace('perfil.html?senha=1');
    });

    // ---------- modal de cadastro ----------
    const modal = document.getElementById('signupModal');
    const openButton = document.getElementById('openSignup');
    const closeButton = document.getElementById('closeSignup');
    const cancelButton = document.getElementById('cancelSignup');
    const signupForm = document.getElementById('signupForm');

    openButton?.addEventListener('click', (e) => {
        e.preventDefault();
        if (!modal) return;
        modal.hidden = false;
        modal.removeAttribute('aria-hidden');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        renderCaptcha('signup');
        modal.querySelector('input')?.focus();
    });

    const closeModal = () => {
        if (!modal) return;
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        modal.style.display = 'none';
        document.body.style.overflow = '';
        openButton?.focus();
    };
    // Termos de uso e Privacidade abrem numa janela (js/legal-modal.js). A caixa do cadastro
    // só fica marcada depois do "Li e concordo" lá dentro; desmarcar continua livre.
    const agreeBox = signupForm?.querySelector('#agreeTerms');
    const openLegal = (tab) => window.EorLegal.open({
        tab,
        agree: true,
        onAgree: () => {
            agreeBox.checked = true;
            setError(signupForm, 'agreeTerms', null);
            agreeBox.focus();
        }
    });
    agreeBox?.addEventListener('click', (e) => {
        if (agreeBox.checked && window.EorLegal) {   // estava desmarcada: primeiro lê
            e.preventDefault();
            openLegal('termos');
        }
    });
    signupForm?.querySelectorAll('[data-legal]').forEach((link) => {
        link.addEventListener('click', (e) => {
            if (!window.EorLegal) return;              // sem o script: abre a página normal
            e.preventDefault();
            openLegal(link.dataset.legal);
        });
    });

    closeButton?.addEventListener('click', closeModal);
    cancelButton?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && modal && !modal.hidden) closeModal();
    });

    function birthDate(day, month, year) {
        const d = Number(day);
        const m = Number(month);
        const y = Number(year);
        if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return null;
        if (y < 1900 || y > new Date().getFullYear() || m < 1 || m > 12) return null;
        if (d < 1 || d > new Date(y, m, 0).getDate()) return null;
        const date = new Date(y, m - 1, d);
        return date > new Date() ? null : date;
    }

    // 16 ou 17 anos → aparece o campo do e-mail do responsável
    const guardianGroup = document.getElementById('guardianGroup');
    function isMinor(birth) {
        if (!birth) return false;
        const age = auth.ageOn(birth);
        return age >= auth.MIN_AGE && age < 18;
    }
    function updateGuardian() {
        if (!signupForm || !guardianGroup) return;
        const minor = isMinor(birthDate(signupForm.day?.value, signupForm.month?.value, signupForm.year?.value));
        guardianGroup.hidden = !minor;
        if (!minor) setError(signupForm, 'guardianEmail', null);
    }
    ['birthDay', 'birthMonth', 'birthYear'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', updateGuardian);
    });

    signupForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors(signupForm);

        const vals = {
            nickname: signupForm.nickname?.value.trim() ?? '',
            email: signupForm.email?.value.trim() ?? '',
            password: signupForm.password?.value ?? '',
            agree: signupForm.querySelector('#agreeTerms')?.checked ?? false
        };
        const birth = birthDate(signupForm.day?.value, signupForm.month?.value, signupForm.year?.value);
        let valid = true;

        if (!auth.NICK_RE.test(vals.nickname)) {
            setError(signupForm, 'nickname', 'nicknameInvalid', 'Invalid nickname. Check the rules above.');
            valid = false;
        }
        if (!/^\S+@\S+\.\S+$/.test(vals.email)) {
            setError(signupForm, 'signupEmail', 'invalidEmail', 'Invalid email.');
            valid = false;
        }
        if (!birth) {
            setError(signupForm, 'dob', 'invalidBirthDate', 'Invalid date of birth.');
            valid = false;
        } else if (auth.ageOn(birth) < auth.MIN_AGE) {
            setError(signupForm, 'dob', 'underAge', 'You must be 16 or older to create an account.');
            valid = false;
        }
        const minor = isMinor(birth);
        const guardian = minor ? (signupForm.guardian?.value.trim().toLowerCase() ?? '') : '';
        if (minor && (!/^\S+@\S+\.\S+$/.test(guardian) || guardian === vals.email.toLowerCase())) {
            setError(signupForm, 'guardianEmail', 'guardianEmailInvalid', 'Enter a valid email for your parent or guardian (different from yours).');
            valid = false;
        }
        if (!strongPassword(vals.password)) {
            setError(signupForm, 'signupPassword', 'errWeakPassword', 'This password is too weak. Follow the rule below the field.');
            valid = false;
        }
        // Senha digitada duas vezes (só no cadastro)
        if (vals.password !== (signupForm.password2?.value ?? '')) {
            setError(signupForm, 'signupPassword2', 'passwordMismatch', 'The passwords do not match.');
            valid = false;
        }
        if (!vals.agree) {
            setError(signupForm, 'agreeTerms', 'acceptTerms', 'You must accept the terms.');
            valid = false;
        }
        const signupToken = captchaToken('signup');
        if (valid && !signupToken) {
            setError(signupForm, 'signup', 'captchaRequired', 'Confirm you are not a robot.');
            valid = false;
        }
        if (!valid) return;

        const submitBtn = signupForm.querySelector('button[type="submit"]');
        busy(submitBtn, true, 'creating', 'Creating...');

        // Apelido livre?
        const { data: available, error: nickError } = await client.rpc('nickname_available', { p_nick: vals.nickname });
        if (nickError) {
            busy(submitBtn, false);
            const [key, fallback] = errorKey(nickError);
            setError(signupForm, 'signup', key, fallback);
            return;
        }
        if (!available) {
            busy(submitBtn, false);
            setError(signupForm, 'nickname', 'nicknameTaken', 'This nickname is already taken.');
            return;
        }

        const pad = (n, size) => String(n).padStart(size, '0');
        const { error } = await client.auth.signUp({
            email: vals.email,
            password: vals.password,
            options: {
                emailRedirectTo: auth.siteUrl('login.html?confirmed=1'),
                captchaToken: signupToken,
                data: {
                    nickname: vals.nickname,
                    birth_date: `${pad(birth.getFullYear(), 4)}-${pad(birth.getMonth() + 1, 2)}-${pad(birth.getDate(), 2)}`,
                    terms_version: auth.TERMS_VERSION,
                    ...(minor ? { guardian_email: guardian } : {})
                }
            }
        });
        resetCaptcha('signup');
        busy(submitBtn, false);

        if (error) {
            const [key, fallback] = errorKey(error);
            const fieldFor = {
                errWeakPassword: 'signupPassword', underAge: 'dob', invalidBirthDate: 'dob',
                nicknameTaken: 'nickname', nicknameInvalid: 'nickname', acceptTerms: 'agreeTerms',
                guardianEmailInvalid: 'guardianEmail'
            };
            const field = fieldFor[key] || 'signup';
            setError(signupForm, field, key, fallback);
            return;
        }

        // Mesma mensagem mesmo se o e-mail já tiver conta (não revela quem é cadastrado)
        closeModal();
        signupForm.reset();
        updateGuardian();
        showView('login');
        if (minor) {
            showNotice('checkEmailMinor', 'Almost there! We sent a confirmation link to {email}. After you confirm and sign in, we will email your guardian asking for permission.', 'success', { email: vals.email });
        } else {
            showNotice('checkEmail', 'Almost there! We sent a confirmation link to {email}. Open it to activate your account (check spam too).', 'success', { email: vals.email });
        }
    });
});
