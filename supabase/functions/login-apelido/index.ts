// Edge Function "login-apelido": entrar com APELIDO + senha sem revelar o e-mail.
//
// Fluxo:
//   1. confere o captcha (Cloudflare Turnstile) com a chave secreta;
//   2. pede ao banco para conferir apelido + senha (public.check_nickname_login,
//      que também aplica o limite de 10 erros / 15 min por apelido);
//   3. se estiver tudo certo, gera um código de uso único e devolve só esse
//      código. O site troca o código por uma sessão (verifyOtp). O e-mail nunca
//      sai do servidor.
//
// Configuração no painel do Supabase:
//   - Edge Functions → nome "login-apelido", com "Verify JWT" DESLIGADO
//     (quem chama ainda não está logado);
//   - Edge Functions → Secrets → TURNSTILE_SECRET = chave secreta do Turnstile.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const ALLOWED_ORIGINS = [
    'https://erickotico.github.io',
    'http://localhost:5517'
];

function serviceKey(): string {
    const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (legacy) return legacy;
    try {
        const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
        return String(Object.values(keys)[0] ?? '');
    } catch {
        return '';
    }
}

Deno.serve(async (req) => {
    const origin = req.headers.get('origin') ?? '';
    const cors = {
        'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Vary': 'Origin'
    };
    const json = (status: number, body: unknown) =>
        new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return json(400, { error: 'bad_request' });
    }
    const nickname = String(body?.nickname ?? '').trim();
    const password = String(body?.password ?? '');
    const captchaToken = String(body?.captchaToken ?? '');
    if (!nickname || !password || !captchaToken || nickname.length > 20 || password.length > 200) {
        return json(400, { error: 'bad_request' });
    }

    // 1. Captcha
    const secret = (Deno.env.get('TURNSTILE_SECRET') ?? '').trim();
    if (!secret) {
        console.error('captcha: TURNSTILE_SECRET não configurado nos Secrets das Edge Functions');
        return json(500, { error: 'server_error' });
    }
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', captchaToken);
    const captcha = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
        .then((r) => r.json())
        .catch((e) => ({ success: false, 'error-codes': [`fetch: ${e}`] }));
    if (!captcha?.success) {
        // Ex.: invalid-input-secret = chave secreta errada; timeout-or-duplicate = token vencido/reusado
        console.error('captcha recusado:', JSON.stringify(captcha?.['error-codes'] ?? []), 'hostname:', captcha?.hostname ?? '-');
        return json(400, { error: 'captcha_failed' });
    }

    // 2. Apelido + senha (dentro do banco)
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey(), {
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: email, error } = await admin.rpc('check_nickname_login', { p_nick: nickname, p_password: password });
    if (error) {
        const msg = error.message ?? '';
        if (msg.includes('EOR_TOO_MANY')) return json(429, { error: 'too_many_attempts' });
        if (msg.includes('EOR_NOT_CONFIRMED')) return json(403, { error: 'email_not_confirmed' });
        console.error('check_nickname_login', msg);
        return json(500, { error: 'server_error' });
    }
    if (!email) return json(400, { error: 'invalid_credentials' });

    // 3. Código de uso único (não envia e-mail nenhum)
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: String(email) });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) {
        console.error('generateLink', linkError?.message);
        return json(500, { error: 'server_error' });
    }
    return json(200, { token_hash: tokenHash });
});
