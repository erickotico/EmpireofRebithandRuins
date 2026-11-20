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

    window.EorAuth = {
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
