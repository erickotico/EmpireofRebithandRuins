// Conexão com o Supabase (contas de jogador).
// A "publishable key" abaixo é PÚBLICA por natureza: ela só identifica o projeto.
// Quem protege os dados são as regras do banco (supabase/001_contas_v1.sql).
// A chave SECRETA nunca entra no site, no repositório nem no computador.
(function () {
    const SUPABASE_URL = 'https://qjpogjpmxbpuuclpdfhv.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_mYKOcjU5XYwsDQW-4Bve8g_SpCqp1Dc';
    const REMEMBER_KEY = 'eor-remember';
    const TERMS_VERSION = '2026-11-20';
    const MIN_AGE = 16;
    // Captcha (Cloudflare Turnstile). A "site key" é pública; a secreta fica só no Supabase.
    const TURNSTILE_SITE_KEY = '0x4AAAAAAGK0ljsGtPrcYIvr';

    // "Lembrar de mim" desmarcado → a sessão some quando o navegador fecha.
    function remembers() {
        try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch { return true; }
    }
    function area() {
        try { return remembers() ? window.localStorage : window.sessionStorage; } catch { return null; }
    }
    const storage = {
        getItem(key) {
            try { return area()?.getItem(key) ?? null; } catch { return null; }
        },
        setItem(key, value) {
            try { area()?.setItem(key, value); } catch { /* armazenamento bloqueado */ }
        },
        removeItem(key) {
            try { localStorage.removeItem(key); } catch { /* */ }
            try { sessionStorage.removeItem(key); } catch { /* */ }
        }
    };

    if (!window.supabase?.createClient) {
        console.error('Biblioteca do Supabase não carregou.');
        return;
    }

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: {
            storage,
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: 'pkce'
        }
    });

    // Endereço da pasta do site (funciona no GitHub Pages e no localhost).
    function siteUrl(page) {
        return new URL(page, window.location.href.split(/[?#]/)[0]).href;
    }

    function setRemember(value) {
        try { localStorage.setItem(REMEMBER_KEY, value ? '1' : '0'); } catch { /* */ }
    }

    // Idade completa na data de hoje.
    function ageOn(birth, today = new Date()) {
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age -= 1;
        return age;
    }

    // Mesmas regras do banco (public.nickname_ok).
    const NICK_RE = /^[A-Za-z0-9_À-ÖØ-öø-ÿĀ-ž-]{3,20}$/;

    // Recusas das funções de amizade (supabase/005_amizades.sql) → [chave de tradução, texto padrão]
    function friendError(error) {
        const reason = String(error?.message || '').match(/EOR_[A-Z_]+/)?.[0];
        const map = {
            EOR_NOT_FOUND: ['errPlayerNotFound', 'Player not found.'],
            EOR_SELF: ['errFriendSelf', 'You cannot add yourself.'],
            EOR_TOO_MANY: ['errFriendTooMany', 'You sent many requests in a short time. Try again in an hour.'],
            EOR_TOO_MANY_PENDING: ['errFriendTooManyPending', 'You have too many requests waiting for an answer.'],
            EOR_FRIEND_LIMIT: ['errFriendLimit', 'Friend limit reached (500).'],
            EOR_ALREADY_FRIENDS: ['errAlreadyFriends', 'You are already friends.'],
            EOR_ALREADY_SENT: ['errAlreadySent', 'Request already sent.'],
            EOR_COOLDOWN: ['errFriendCooldown', 'This player declined your request recently. Try again in a few days.'],
            EOR_BANNED: ['errBanned', 'Your account is suspended.'],
            EOR_MFA: ['errNeedMfa', 'Confirm your two-step code to continue.'],
            EOR_BLOCKED: ['errBlocked', 'You cannot interact with this player.']
        };
        if (reason && map[reason]) return map[reason];
        console.warn('[amigos]', error?.code, error?.message);
        return ['errGeneric', 'Something went wrong. Please try again.'];
    }

    window.EorAuth = {
        friendError,
        client,
        SUPABASE_URL,
        SUPABASE_KEY,
        siteUrl,
        setRemember,
        remembers,
        ageOn,
        NICK_RE,
        TERMS_VERSION,
        MIN_AGE,
        TURNSTILE_SITE_KEY
    };
})();
