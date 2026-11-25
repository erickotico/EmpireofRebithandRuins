// Edge Function "recuperar-conta": entrar com o CÓDIGO DE RECUPERAÇÃO quando a
// pessoa perdeu a senha, o e-mail ou o celular da verificação em duas etapas.
//
// Fluxo:
//   1. confere o captcha (Cloudflare Turnstile);
//   2. confere apelido (ou e-mail) + código no banco (public.recovery_check,
//      com limite de 5 erros por hora por conta);
//   3. se a pessoa informou um e-mail novo, troca o e-mail da conta;
//   4. troca a senha por uma aleatória (quem invadiu perde o acesso), remove a
//      verificação em duas etapas e encerra todas as sessões; o código é gasto
//      e sai um aviso por e-mail (public.recovery_finish);
//   5. devolve um código de uso único para o site entrar na conta e pedir a
//      senha nova (igual ao login por apelido).
//
// Configuração no painel do Supabase:
//   - Edge Functions → nome "recuperar-conta", com "Verify JWT" DESLIGADO;
//   - usa o mesmo Secret TURNSTILE_SECRET da função "login-apelido".
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

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
    const login = String(body?.login ?? '').trim();
    const code = String(body?.code ?? '').trim();
    const newEmail = String(body?.newEmail ?? '').trim().toLowerCase();
    const captchaToken = String(body?.captchaToken ?? '');
    if (!login || !code || !captchaToken || login.length > 254 || code.length > 40 || newEmail.length > 254) {
        return json(400, { error: 'bad_request' });
    }
    if (newEmail && !EMAIL_RE.test(newEmail)) return json(400, { error: 'invalid_email' });

    // 1. Captcha
    const secret = (Deno.env.get('TURNSTILE_SECRET') ?? '').trim();
    if (!secret) {
        console.error('captcha: TURNSTILE_SECRET não configurado');
        return json(500, { error: 'server_error' });
    }
    const form = new FormData();
    form.append('secret', secret);
    form.append('response', captchaToken);
    const captcha = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form })
        .then((r) => r.json())
        .catch(() => ({ success: false }));
    if (!captcha?.success) return json(400, { error: 'captcha_failed' });

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey(), {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    // 2. Código
    const { data: found, error: checkError } = await admin.rpc('recovery_check', { p_login: login, p_code: code });
    if (checkError) {
        if ((checkError.message ?? '').includes('EOR_TOO_MANY')) return json(429, { error: 'too_many_attempts' });
        console.error('recovery_check', checkError.message);
        return json(500, { error: 'server_error' });
    }
    if (!found) return json(400, { error: 'invalid_code' });
    const userId = String(found.user_id);
    const oldEmail = String(found.email ?? '');
    let finalEmail = oldEmail;

    // 3. E-mail novo (opcional)
    if (newEmail && newEmail !== oldEmail.toLowerCase()) {
        const { error } = await admin.auth.admin.updateUserById(userId, { email: newEmail, email_confirm: true });
        if (error) {
            const taken = /already|exists|registered/i.test(error.message ?? '');
            if (!taken) console.error('updateUserById email', error.message);
            return json(taken ? 409 : 500, { error: taken ? 'email_taken' : 'server_error' });
        }
        finalEmail = newEmail;
    }

    // 4. Senha aleatória + sem 2FA + sem sessões + código gasto + aviso
    const random = crypto.getRandomValues(new Uint8Array(32));
    const password = btoa(String.fromCharCode(...random)) + 'aA1!';
    const { error: passError } = await admin.auth.admin.updateUserById(userId, { password });
    if (passError) {
        console.error('updateUserById password', passError.message);
        return json(500, { error: 'server_error' });
    }
    const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId });
    for (const factor of factors?.factors ?? []) {
        const { error } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
        if (error) console.error('deleteFactor', error.message);
    }
    const { error: finishError } = await admin.rpc('recovery_finish', { p_user: userId, p_old_email: oldEmail, p_new_email: finalEmail });
    if (finishError) {
        console.error('recovery_finish', finishError.message);
        return json(500, { error: 'server_error' });
    }

    // 5. Entrada de uso único (o site troca por uma sessão e pede a senha nova)
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: finalEmail });
    const tokenHash = link?.properties?.hashed_token;
    if (linkError || !tokenHash) {
        console.error('generateLink', linkError?.message);
        return json(500, { error: 'server_error' });
    }
    return json(200, { token_hash: tokenHash, nickname: found.nickname });
});
