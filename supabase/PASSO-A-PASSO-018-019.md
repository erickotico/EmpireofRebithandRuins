# Passo a passo: ativar o 018 e o 019

Faça na ordem. Nenhum passo pede para você me mandar chave nenhuma: as chaves ficam só nos painéis.

## 1. Brevo

1. **Chave de API:** menu da conta (canto superior direito) → **SMTP & API** → aba **API Keys** → **Generate a new API key** → nome `supabase-enviar-email`. Copie a chave. Não mande para ninguém.
2. **Retenção dos registros:** menu da conta → **Settings** → **Transactional emails** → **Retention rules** → escolha **1 month** e salve. Por padrão a Brevo guarda para sempre; a Política de privacidade diz 30 dias.

## 2. Supabase: segredo da chave da Brevo

**Edge Functions** → **Secrets** → **Add new secret**:
- Name: `BREVO_API_KEY`
- Value: a chave do passo 1

O `TURNSTILE_SECRET` já existe (é do login por apelido) e a função nova usa o mesmo.

## 3. Supabase: rodar o SQL

**SQL Editor** → **New query** → cole o arquivo inteiro → **Run**. Primeiro `018_contas_seguranca.sql`, depois `019_comunidade_moderacao.sql`.

- O 018 liga a extensão `pg_net`, que o banco usa para chamar a função de e-mail. Se der erro dizendo que a extensão não existe, ative em **Database → Extensions → pg_net** e rode de novo.
- Os dois arquivos foram testados num Postgres local com 71 verificações (cadastro de menor, autorização, termos, troca de apelido, banimento, código de recuperação, posts removidos, denúncias graves, exclusão de conta e limpeza automática).

## 4. Supabase: as duas Edge Functions novas

Do mesmo jeito que você criou a `login-apelido`: **Edge Functions** → **Deploy a new function** → **Via Editor**.

| Nome | Arquivo para colar | Verify JWT |
|---|---|---|
| `enviar-email` | `supabase/functions/enviar-email/index.ts` | **desligado** |
| `recuperar-conta` | `supabase/functions/recuperar-conta/index.ts` | **desligado** |

O "Verify JWT" (ou "Enforce JWT verification") fica nas configurações de cada função. Precisa estar desligado porque quem chama é o próprio banco (e-mails) ou alguém que ainda não entrou na conta (recuperação).

## 5. Supabase: auditoria do login

**Authentication** → **Audit Logs** → ligue **"Disable writing auth audit logs to project database"**. Os registros continuam no painel por pouco tempo, mas param de se acumular no banco.

## 6. Supabase: avisos de segurança por e-mail

**Authentication** → **Emails**. Se não aparecer a parte de avisos de segurança (Security notifications), ative antes: clique no seu avatar → **Feature previews** → **Security notification templates**.

Ligue estes quatro e cole o modelo e o assunto de cada um (os assuntos estão em `supabase/emails/assuntos.json`):

| Aviso | Modelo |
|---|---|
| Password changed | `supabase/emails/aviso-senha-alterada.html` |
| Email changed | `supabase/emails/aviso-email-alterado.html` |
| MFA factor enrolled | `supabase/emails/aviso-2fa-ativada.html` |
| MFA factor unenrolled | `supabase/emails/aviso-2fa-desativada.html` |

## 7. Supabase: troca de e-mail segura

**Authentication** → **Sign In / Providers** → **Email** → confira que **Secure email change** está ligado. Assim, quem troca o e-mail confirma nos dois endereços (o novo e o atual).

## 8. Testar (com uma conta de teste, não a sua de admin)

1. Crie uma conta com data de nascimento de 17 anos e um e-mail seu como responsável. Entre: deve aparecer o aviso "Aguardando o seu responsável", e o e-mail do pedido deve chegar.
2. Abra o link do e-mail e autorize. A conta passa a poder postar.
3. Em Editar perfil, crie o código de recuperação. Saia, vá em Entrar → Esqueceu a senha? → "Perdeu o acesso ao e-mail?" e recupere a conta com o código.
4. Denuncie um post como "Golpe": o alerta deve chegar no e-mail da sua conta de admin.
5. Exclua a conta de teste: deve chegar o e-mail de confirmação.

Se algum e-mail não chegar: **Edge Functions → enviar-email → Logs** mostra o motivo (por exemplo, chave da Brevo errada).

## Útil depois

- **Responsável retirou a autorização** (pediu por e-mail): no SQL Editor, troque `APELIDO` e rode. A conta volta a ficar travada e é excluída no dia seguinte.

  ```sql
  update public.account_guardian g set status = 'denied', decided_at = now()
  from public.profiles p where p.id = g.user_id and lower(p.nickname) = lower('APELIDO');
  ```
