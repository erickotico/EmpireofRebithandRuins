// Edge Function "enviar-email": manda os e-mails da fila (public.email_outbox) pela Brevo.
//
// Como funciona:
//   1. O banco grava o e-mail na fila e chama esta função com { id } (pg_net).
//   2. A função pega a linha pela chave de serviço (email_claim: uma vez só),
//      monta o e-mail e envia pela API da Brevo.
//   3. Deu certo → a linha é apagada (email_done). Deu erro → volta para a fila
//      e a faxina tenta de novo (até 5 vezes).
// Quem chamar esta função "de fora" só consegue disparar o que já está na fila.
//
// Configuração no painel do Supabase:
//   - Edge Functions → nome "enviar-email", com "Verify JWT" DESLIGADO
//     (quem chama é o próprio banco, sem login);
//   - Edge Functions → Secrets → BREVO_API_KEY = chave de API da Brevo (v3).
//   - (opcional) EMAIL_FROM = remetente; padrão empireofrebirth@gmail.com
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const SITE = 'https://erickotico.github.io/EmpireofRebithandRuins';
const FROM = (Deno.env.get('EMAIL_FROM') ?? 'empireofrebirth@gmail.com').trim();

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

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// ---------- visual (o mesmo dos e-mails de cadastro e senha) ----------
const F_TEXT = "font-family:'Segoe UI', Helvetica, Arial, sans-serif;";
const P = `margin:0 0 16px;${F_TEXT}font-size:16px;line-height:1.6;color:#e9e1d1;`;
const SMALL = `margin:24px 0 0;padding-top:20px;border-top:1px solid #2e261a;${F_TEXT}font-size:13px;line-height:1.6;color:#a59a86;`;
const p = (html: string) => `<p style="${P}">${html}</p>`;
const small = (html: string) => `<p style="${SMALL}">${html}</p>`;
const strong = (t: unknown) => `<strong style="color:#f2cd7a;">${esc(t)}</strong>`;
const link = (href: string, text: string) => `<a href="${href}" style="color:#d9a441;">${esc(text)}</a>`;
function button(href: string, label: string) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:28px auto;">
        <tr><td align="center" bgcolor="#d9a441" style="background-color:#d9a441;border-radius:4px;border:1px solid #f2cd7a;">
          <a href="${href}" target="_blank" style="display:inline-block;padding:15px 34px;font-family:Georgia, 'Times New Roman', serif;font-size:15px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#1a1206;text-decoration:none;">${esc(label)}</a>
        </td></tr></table>`;
}
function layout(kicker: string, title: string, body: string, english = '') {
    const en = english
        ? `<tr><td style="padding:20px 12px 0;${F_TEXT}font-size:13px;line-height:1.6;color:#7d7362;">${english}</td></tr>`
        : '';
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background-color:#0c0b0a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0c0b0a" style="background-color:#0c0b0a;">
<tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
    <tr><td align="center" style="padding:0 0 24px;">
      <img src="${SITE}/img/LogoRPG.jpg" width="88" height="88" alt="Empire of Rebirth &amp; Ruins" style="display:block;width:88px;height:88px;border-radius:44px;border:1px solid #9c6b1d;">
    </td></tr>
    <tr><td bgcolor="#16130f" style="background-color:#16130f;border:1px solid #4a3a22;border-top:3px solid #d9a441;border-radius:4px;padding:40px 36px;">
      <p style="margin:0 0 10px;${F_TEXT}font-size:12px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#d9a441;text-align:center;">${esc(kicker)}</p>
      <h1 style="margin:0 0 24px;font-family:Georgia, 'Times New Roman', serif;font-size:26px;line-height:1.25;font-weight:700;color:#f2cd7a;text-align:center;">${esc(title)}</h1>
      ${body}
    </td></tr>
    ${en}
    <tr><td style="padding:28px 8px 0;font-family:Georgia, 'Times New Roman', serif;font-size:13px;color:#7d7362;text-align:center;">
      <a href="${SITE}/" style="color:#a59a86;text-decoration:none;">Empire of Rebirth &amp; Ruins</a> &middot; um jogo da Myth Forge Studios
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

const CATEGORY: Record<string, string> = {
    menor: 'conteúdo envolvendo menores', ameaca: 'ameaça ou violência', autolesao: 'risco de autolesão',
    golpe: 'golpe ou link perigoso', dados: 'exposição de dados pessoais'
};
const SOURCE: Record<string, string> = { post: 'uma publicação', comment: 'um comentário', message: 'uma mensagem privada' };

type Row = { id: number; kind: string; to: string; data: Record<string, unknown> };

function build(row: Row): { subject: string; html: string } | null {
    const d = row.data ?? {};
    const nick = d.nickname ?? '';
    switch (row.kind) {
        case 'guardian_request': {
            const url = `${SITE}/responsavel.html?t=${encodeURIComponent(String(d.token ?? ''))}`;
            return {
                subject: 'Pedido de autorização · Empire of Rebirth & Ruins',
                html: layout('Autorização do responsável', 'Um pedido para você',
                    p(`O jogador ${strong(nick)} (${esc(d.age)} anos) criou uma conta no site da comunidade de Empire of Rebirth &amp; Ruins e informou este e-mail como o de um responsável.`) +
                    p('Quem tem 16 ou 17 anos só pode usar a conta com a autorização de um responsável. Na página abaixo você vê o que o site faz, lê os Termos de uso e a Política de privacidade e decide se autoriza:') +
                    button(url, 'Ver o pedido') +
                    p('O link vale por 7 dias. Sem autorização nesse prazo, a conta é excluída automaticamente.') +
                    small(`Não conhece esse pedido? Pode ignorar este e-mail. Dúvidas: ${link('mailto:empireofrebirth@gmail.com', 'empireofrebirth@gmail.com')}.`),
                    `<strong>English:</strong> the player ${esc(nick)} (age ${esc(d.age)}) signed up on the Empire of Rebirth &amp; Ruins community site and gave this address as a parent or guardian. Players aged 16–17 need a guardian's permission. ${link(url, 'Review the request')} (valid for 7 days). If you don't know about it, just ignore this e-mail.`)
            };
        }
        case 'guardian_result': {
            const ok = d.approved === true;
            return {
                subject: ok ? 'Sua conta foi autorizada · Empire of Rebirth & Ruins' : 'Sua conta não foi autorizada · Empire of Rebirth & Ruins',
                html: ok
                    ? layout('Conta liberada', 'Tudo certo!',
                        p(`Olá, ${strong(nick)}. Seu responsável autorizou a sua conta. Agora você já pode postar, comentar e conversar com os amigos.`) +
                        button(`${SITE}/perfil.html`, 'Abrir meu perfil'),
                        `<strong>English:</strong> your guardian approved your account. You can now post, comment and chat.`)
                    : layout('Conta não autorizada', 'Pedido recusado',
                        p(`Olá, ${strong(nick)}. O responsável que você indicou não autorizou a sua conta.`) +
                        p('Por isso a conta será excluída em até 24 horas, junto com os dados dela. Quando completar 18 anos, você pode criar uma conta nova.'),
                        `<strong>English:</strong> your guardian did not approve your account. It will be deleted within 24 hours.`)
            };
        }
        case 'account_deleted':
            return {
                subject: 'Sua conta foi excluída · Empire of Rebirth & Ruins',
                html: layout('Conta excluída', 'Até a próxima jornada',
                    p(`A conta ${strong(nick)} foi excluída do site de Empire of Rebirth &amp; Ruins, junto com o perfil, as publicações, as imagens, as mensagens e as amizades.`) +
                    p(`Alguns registros ficam guardados por um tempo, sem ligação com a sua conta (por exemplo, denúncias e o histórico de moderação). Os prazos estão na ${link(`${SITE}/privacidade.html`, 'Política de privacidade')}.`) +
                    small(`Não foi você que pediu? Escreva para ${link('mailto:empireofrebirth@gmail.com', 'empireofrebirth@gmail.com')}.`),
                    `<strong>English:</strong> the account ${esc(nick)} was deleted from the Empire of Rebirth &amp; Ruins site. Some records are kept for a limited time without a link to the account, as described in the Privacy Policy.`)
            };
        case 'account_removed_guardian':
            return {
                subject: 'Sua conta foi excluída · Empire of Rebirth & Ruins',
                html: layout('Conta excluída', 'Sem autorização do responsável',
                    p(`A conta ${strong(nick)} foi excluída porque não recebeu a autorização de um responsável a tempo (7 dias depois do cadastro) ou porque o pedido foi recusado.`) +
                    p('Os dados da conta foram apagados. Quando completar 18 anos, você pode criar uma conta nova.'),
                    `<strong>English:</strong> the account ${esc(nick)} was deleted because it did not receive a guardian's permission in time.`)
            };
        case 'urgent_report':
            return {
                subject: `Denúncia grave: ${CATEGORY[String(d.category)] ?? d.category}`,
                html: layout('Moderação', 'Nova denúncia grave',
                    p(`Chegou uma denúncia de ${strong(CATEGORY[String(d.category)] ?? d.category)} sobre ${esc(SOURCE[String(d.source)] ?? 'um conteúdo')}.`) +
                    p('Ela já está no topo do painel de moderação.') +
                    button(`${SITE}/moderacao.html`, 'Abrir a moderação') +
                    small('Por segurança, este e-mail não traz o conteúdo denunciado. Entre no site (com a verificação em duas etapas) para ver.'))
            };
        case 'recovery_used': {
            const newEmail = d.new_email ? ` O e-mail da conta foi trocado para ${strong(d.new_email)}.` : '';
            return {
                subject: 'O código de recuperação foi usado · Empire of Rebirth & Ruins',
                html: layout('Segurança da conta', 'Conta recuperada',
                    p(`O código de recuperação da conta ${strong(nick)} acabou de ser usado.${newEmail}`) +
                    p('Por segurança: todas as sessões foram encerradas, a verificação em duas etapas foi desligada e foi preciso criar uma senha nova. Lembre de gerar um código de recuperação novo em Editar perfil.') +
                    small(`Não foi você? Escreva agora para ${link('mailto:empireofrebirth@gmail.com', 'empireofrebirth@gmail.com')}, a partir deste e-mail.`),
                    `<strong>English:</strong> the recovery code for the account ${esc(nick)} was just used. All sessions were ended and two-step verification was turned off. Not you? Write to empireofrebirth@gmail.com right away.`)
            };
        }
    }
    return null;
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
    let id = 0;
    try {
        id = Number((await req.json())?.id);
    } catch { /* corpo inválido */ }
    if (!Number.isSafeInteger(id) || id <= 0) return new Response('bad_request', { status: 400 });

    const apiKey = (Deno.env.get('BREVO_API_KEY') ?? '').trim();
    if (!apiKey) {
        console.error('BREVO_API_KEY não configurada nos Secrets das Edge Functions');
        return new Response('server_error', { status: 500 });
    }
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey(), {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    const { data: row, error } = await admin.rpc('email_claim', { p_id: id });
    if (error) {
        console.error('email_claim', error.message);
        return new Response('server_error', { status: 500 });
    }
    if (!row) return new Response('nothing_to_do', { status: 200 });

    const mail = build(row as Row);
    if (!mail) {
        await admin.rpc('email_done', { p_id: id, p_error: 'tipo desconhecido' });
        return new Response('unknown_kind', { status: 200 });
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            sender: { name: 'Empire of Rebirth & Ruins', email: FROM },
            to: [{ email: (row as Row).to }],
            subject: mail.subject,
            htmlContent: mail.html
        })
    }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as unknown as Response);

    if (!res.ok) {
        const detail = `brevo ${res.status}: ${(await res.text()).slice(0, 200)}`;
        console.error(detail);
        await admin.rpc('email_done', { p_id: id, p_error: detail });
        return new Response('send_failed', { status: 502 });
    }
    await admin.rpc('email_done', { p_id: id, p_error: null });
    return new Response('sent', { status: 200 });
});
