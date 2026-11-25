-- =====================================================================
-- Empire of Rebirth & Ruins · v1.16: conta, responsável e segurança
-- Rodar UMA vez no SQL Editor (depois do 017). Em seguida rode o 019.
--
--   · Fila de e-mails (email_outbox): o banco anota o e-mail a mandar e
--     chama a Edge Function "enviar-email", que envia pela Brevo e apaga
--     a linha. Nada de chave da Brevo no banco.
--   · Restrições: banido, menor de 18 sem autorização do responsável, ou
--     termos novos não aceitos → não posta, não comenta, não manda mensagem.
--   · 16 e 17 anos: o cadastro pede o e-mail de um responsável; a conta
--     fica travada até ele autorizar pelo link (responsavel.html).
--     Sem autorização em 7 dias (ou recusada) → a conta é excluída.
--   · Trocar o apelido: 1 vez a cada 30 dias; o antigo fica reservado
--     por 30 dias para ninguém se passar pela pessoa.
--   · E-mail de quem foi banido: guardamos só uma "impressão" (hash) para
--     barrar um cadastro novo com o mesmo e-mail.
--   · Código de recuperação: o banco guarda só o hash (como a senha).
--   · "Baixar meus dados": tudo o que o site guarda da pessoa, em JSON.
-- =====================================================================

begin;

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------
-- 1. Fila de e-mails
-- ---------------------------------------------------------------------
create table public.email_outbox (
  id          bigint generated always as identity primary key,
  kind        text not null check (kind in (
                'guardian_request', 'guardian_result', 'account_deleted', 'account_removed_guardian',
                'urgent_report', 'recovery_used')),
  to_email    text not null,
  data        jsonb not null default '{}'::jsonb,
  attempts    int not null default 0,
  claimed_at  timestamptz,
  last_error  text,
  created_at  timestamptz not null default now()
);
alter table public.email_outbox enable row level security;
revoke all on public.email_outbox from public, anon, authenticated;

-- Chama a Edge Function. O pg_net só envia depois que a transação confirma;
-- se der qualquer erro aqui, a ação do jogador continua normalmente.
create or replace function public.email_send_now(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform net.http_post(
      url := 'https://qjpogjpmxbpuuclpdfhv.supabase.co/functions/v1/enviar-email',
      body := jsonb_build_object('id', p_id),
      headers := '{"Content-Type": "application/json"}'::jsonb);
  exception when others then null;
  end;
end;
$$;

create or replace function public.email_outbox_kick()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.email_send_now(new.id);
  return null;
end;
$$;
create trigger email_outbox_send after insert on public.email_outbox
  for each row execute function public.email_outbox_kick();

-- Usadas SÓ pela Edge Function "enviar-email" (chave de serviço):
-- pega a linha (uma vez só, mesmo com duas chamadas ao mesmo tempo)...
create or replace function public.email_claim(p_id bigint)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.email_outbox;
begin
  update public.email_outbox o
     set claimed_at = now(), attempts = o.attempts + 1
   where o.id = p_id and o.claimed_at is null and o.attempts < 5
  returning * into v_row;
  if v_row.id is null then return null; end if;
  return json_build_object('id', v_row.id, 'kind', v_row.kind, 'to', v_row.to_email, 'data', v_row.data);
end;
$$;

-- ...e depois apaga (enviado) ou devolve para a fila (erro)
create or replace function public.email_done(p_id bigint, p_error text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_error is null then
    delete from public.email_outbox o where o.id = p_id;
  else
    update public.email_outbox o set claimed_at = null, last_error = left(p_error, 300) where o.id = p_id;
  end if;
end;
$$;

create or replace function public.email_valid(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_email is not null and char_length(p_email) <= 254
     and p_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$';
$$;

-- ---------------------------------------------------------------------
-- 2. Responsável (16 e 17 anos)
-- ---------------------------------------------------------------------
create table public.account_guardian (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  guardian_email  text not null,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  token_hash      text,
  token_expires   timestamptz,
  sent_at         timestamptz,
  sent_day        date,
  send_count      int not null default 0,
  decided_at      timestamptz,
  created_at      timestamptz not null default now()
);
create unique index account_guardian_token on public.account_guardian (token_hash) where token_hash is not null;
alter table public.account_guardian enable row level security;
revoke all on public.account_guardian from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Restrições da conta
--    'banned'   = suspensão ou banimento ativo
--    'guardian' = 16/17 anos sem autorização do responsável
--    'terms'    = ainda não aceitou a versão atual dos termos
-- ---------------------------------------------------------------------
create or replace function public.account_restriction()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when v.uid is null then null
    when exists (select 1 from public.bans b
                 where b.user_id = v.uid and (b.banned_until is null or b.banned_until > now())) then 'banned'
    when exists (select 1 from public.profiles_private pp
                 where pp.id = v.uid and pp.birth_date > (current_date - interval '18 years')::date)
         and not exists (select 1 from public.account_guardian g
                         where g.user_id = v.uid and g.status = 'approved') then 'guardian'
    when public.terms_pending() then 'terms'
  end
  from (select (select auth.uid()) as uid) v;
$$;

-- is_banned() já é usada por TODAS as ações (postar, comentar, curtir, mensagem,
-- amizade, imagem, bio). Agora ela também barra quem está aguardando o
-- responsável ou os termos, com um código de erro próprio para o site explicar.
create or replace function public.is_banned()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_r text := public.account_restriction();
begin
  if v_r = 'guardian' then raise exception 'EOR_GUARDIAN'; end if;
  if v_r = 'terms' then raise exception 'EOR_TERMS_PENDING'; end if;
  return coalesce(v_r = 'banned', false);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Apelidos: histórico (reserva de 30 dias) e e-mails de banidos
-- ---------------------------------------------------------------------
create table public.nickname_history (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  old_nickname  text not null,
  new_nickname  text not null,
  by_admin      boolean not null default false,
  changed_at    timestamptz not null default now()
);
create index nickname_history_user on public.nickname_history (user_id, changed_at desc);
create index nickname_history_old on public.nickname_history (lower(old_nickname), changed_at desc);
alter table public.nickname_history enable row level security;
revoke all on public.nickname_history from public, anon, authenticated;

-- Apelido largado por OUTRA pessoa há menos de 30 dias?
create or replace function public.nickname_reserved(p_nick text, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.nickname_history h
    where lower(h.old_nickname) = lower(btrim(p_nick))
      and h.user_id is distinct from p_user
      and h.changed_at > now() - interval '30 days');
$$;

create or replace function public.nickname_available(p_nick text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.nickname_ok(btrim(p_nick))
     and not exists (select 1 from public.profiles where lower(nickname) = lower(btrim(p_nick)))
     and not public.nickname_reserved(p_nick, null);
$$;

create table public.banned_emails (
  email_hash  text primary key,
  user_id     uuid references auth.users (id) on delete set null,
  until_at    timestamptz,                   -- vazio = para sempre
  created_at  timestamptz not null default now()
);
alter table public.banned_emails enable row level security;
revoke all on public.banned_emails from public, anon, authenticated;

-- "Impressão" do e-mail: minúsculas, sem o +apelido, Gmail sem pontos, e embaralhado (SHA-256)
create or replace function public.email_fingerprint(p_email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v        text := lower(btrim(coalesce(p_email, '')));
  v_local  text;
  v_domain text;
begin
  if position('@' in v) = 0 then return null; end if;
  v_local := split_part(split_part(v, '@', 1), '+', 1);
  v_domain := split_part(v, '@', 2);
  if v_domain in ('gmail.com', 'googlemail.com') then
    v_local := replace(v_local, '.', '');
    v_domain := 'gmail.com';
  end if;
  return encode(extensions.digest('eor-ban:' || v_local || '@' || v_domain, 'sha256'), 'hex');
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Cadastro (mesmas regras de antes + responsável + e-mail banido + apelido reservado)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nick      text := btrim(coalesce(new.raw_user_meta_data ->> 'nickname', ''));
  v_terms     text := btrim(coalesce(new.raw_user_meta_data ->> 'terms_version', ''));
  v_guardian  text := lower(btrim(coalesce(new.raw_user_meta_data ->> 'guardian_email', '')));
  v_birth     date;
begin
  begin
    v_birth := (new.raw_user_meta_data ->> 'birth_date')::date;
  exception when others then
    raise exception 'EOR_BIRTH_INVALID';
  end;

  if v_birth is null or v_birth < date '1900-01-01' then
    raise exception 'EOR_BIRTH_INVALID';
  end if;
  if v_birth > (current_date - interval '16 years')::date then
    raise exception 'EOR_UNDERAGE';
  end if;
  if exists (select 1 from public.banned_emails be
             where be.email_hash = public.email_fingerprint(new.email)
               and (be.until_at is null or be.until_at > now())) then
    raise exception 'EOR_EMAIL_BLOCKED';
  end if;
  if not public.nickname_ok(v_nick) then
    raise exception 'EOR_NICK_INVALID';
  end if;
  if exists (select 1 from public.profiles where lower(nickname) = lower(v_nick))
     or public.nickname_reserved(v_nick, null) then
    raise exception 'EOR_NICK_TAKEN';
  end if;
  if v_terms = '' then
    raise exception 'EOR_TERMS';
  end if;

  insert into public.profiles (id, nickname) values (new.id, v_nick);
  insert into public.profiles_private (id, birth_date, terms_version)
  values (new.id, v_birth, v_terms);

  -- 16 ou 17 anos: precisa do e-mail de um responsável (diferente do próprio)
  if v_birth > (current_date - interval '18 years')::date then
    if not public.email_valid(v_guardian) or v_guardian = lower(btrim(coalesce(new.email, ''))) then
      raise exception 'EOR_GUARDIAN_EMAIL';
    end if;
    insert into public.account_guardian (user_id, guardian_email) values (new.id, v_guardian);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Responsável: enviar pedido, ver o pedido, responder
-- ---------------------------------------------------------------------
-- O jogador (16/17) pede o envio (ou troca o e-mail do responsável e reenvia)
create or replace function public.guardian_send(p_email text default null)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_birth  date;
  v_g      public.account_guardian;
  v_email  text;
  v_token  text;
  v_nick   text;
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  select pp.birth_date into v_birth from public.profiles_private pp where pp.id = v_me;
  if v_birth is null or v_birth <= (current_date - interval '18 years')::date then raise exception 'EOR_INVALID'; end if;

  select * into v_g from public.account_guardian g where g.user_id = v_me for update;
  if v_g.status = 'approved' then raise exception 'EOR_INVALID'; end if;
  if v_g.status = 'denied' then raise exception 'EOR_GUARDIAN_DENIED'; end if;

  v_email := lower(btrim(coalesce(nullif(btrim(p_email), ''), v_g.guardian_email, '')));
  if not public.email_valid(v_email)
     or v_email = (select lower(u.email) from auth.users u where u.id = v_me) then
    raise exception 'EOR_GUARDIAN_EMAIL';
  end if;
  if v_g.sent_at is not null and v_g.sent_at > now() - interval '10 minutes' then raise exception 'EOR_WAIT'; end if;
  if v_g.sent_day = current_date and v_g.send_count >= 5 then raise exception 'EOR_TOO_MANY'; end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.account_guardian as g
    (user_id, guardian_email, status, token_hash, token_expires, sent_at, sent_day, send_count)
  values (v_me, v_email, 'pending', encode(extensions.digest(v_token, 'sha256'), 'hex'),
          now() + interval '7 days', now(), current_date, 1)
  on conflict (user_id) do update
    set guardian_email = excluded.guardian_email,
        status = 'pending',
        token_hash = excluded.token_hash,
        token_expires = excluded.token_expires,
        sent_at = excluded.sent_at,
        send_count = case when g.sent_day = current_date then g.send_count + 1 else 1 end,
        sent_day = current_date;

  select pr.nickname into v_nick from public.profiles pr where pr.id = v_me;
  insert into public.email_outbox (kind, to_email, data)
  values ('guardian_request', v_email, jsonb_build_object(
    'nickname', v_nick,
    'age', extract(year from age(current_date, v_birth))::int,
    'token', v_token));
  return json_build_object('email', v_email, 'sent_at', now());
end;
$$;

-- Página do responsável: de quem é o pedido?
create or replace function public.guardian_lookup(p_token text)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_g     public.account_guardian;
  v_nick  text;
  v_birth date;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into v_g from public.account_guardian g
  where g.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if v_g.user_id is null then return null; end if;
  select pr.nickname into v_nick from public.profiles pr where pr.id = v_g.user_id;
  select pp.birth_date into v_birth from public.profiles_private pp where pp.id = v_g.user_id;
  return json_build_object(
    'nickname', v_nick,
    'age', extract(year from age(current_date, v_birth))::int,
    'status', v_g.status,
    'expired', v_g.token_expires < now());
end;
$$;

create or replace function public.guardian_respond(p_token text, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_g      public.account_guardian;
  v_email  text;
  v_nick   text;
  v_status text := case when p_accept then 'approved' else 'denied' end;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' or p_accept is null then raise exception 'EOR_NOT_FOUND'; end if;
  select * into v_g from public.account_guardian g
  where g.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if v_g.user_id is null then raise exception 'EOR_NOT_FOUND'; end if;
  if v_g.status <> 'pending' then return v_g.status; end if;
  if v_g.token_expires < now() then raise exception 'EOR_EXPIRED'; end if;

  update public.account_guardian g
     set status = v_status, decided_at = now(), token_hash = null, token_expires = null
   where g.user_id = v_g.user_id;

  select u.email into v_email from auth.users u where u.id = v_g.user_id;
  select pr.nickname into v_nick from public.profiles pr where pr.id = v_g.user_id;
  if v_email is not null then
    insert into public.email_outbox (kind, to_email, data)
    values ('guardian_result', v_email, jsonb_build_object('nickname', v_nick, 'approved', p_accept));
  end if;
  return v_status;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Trocar o apelido (1 vez a cada 30 dias)
-- ---------------------------------------------------------------------
create or replace function public.change_nickname(p_new text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := public.assert_can_write();
  v_new   text := btrim(coalesce(p_new, ''));
  v_old   text;
  v_last  timestamptz;
begin
  if not public.nickname_ok(v_new) then raise exception 'EOR_NICK_INVALID'; end if;
  select pr.nickname into v_old from public.profiles pr where pr.id = v_me;
  if v_new = v_old then raise exception 'EOR_NICK_SAME'; end if;
  if exists (select 1 from public.profiles pr where lower(pr.nickname) = lower(v_new) and pr.id <> v_me)
     or public.nickname_reserved(v_new, v_me) then
    raise exception 'EOR_NICK_TAKEN';
  end if;
  select max(h.changed_at) into v_last from public.nickname_history h where h.user_id = v_me and not h.by_admin;
  if v_last is not null and v_last > now() - interval '30 days' then raise exception 'EOR_NICK_COOLDOWN'; end if;

  update public.profiles pr set nickname = v_new where pr.id = v_me;
  insert into public.nickname_history (user_id, old_nickname, new_nickname) values (v_me, v_old, v_new);
  begin
    update auth.users u
       set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nickname', v_new)
     where u.id = v_me;
  exception when others then null;
  end;
  return json_build_object('nickname', v_new, 'next_change_at', now() + interval '30 days');
end;
$$;

-- Troca feita pela moderação: não conta no limite do jogador, mas reserva o antigo
create or replace function public.admin_rename(p_nick text, p_new text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid := public.mod_target(p_nick);
  v_reason text := public.mod_reason(p_reason);
  v_new    text := btrim(coalesce(p_new, ''));
  v_old    text;
begin
  if not public.nickname_ok(v_new) then raise exception 'EOR_NICK_INVALID'; end if;
  if exists (select 1 from public.profiles pr where lower(pr.nickname) = lower(v_new) and pr.id <> v_id) then
    raise exception 'EOR_NICK_TAKEN';
  end if;
  select pr.nickname into v_old from public.profiles pr where pr.id = v_id;
  update public.profiles pr set nickname = v_new where pr.id = v_id;
  insert into public.nickname_history (user_id, old_nickname, new_nickname, by_admin) values (v_id, v_old, v_new, true);
  begin
    update auth.users u
       set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('nickname', v_new)
     where u.id = v_id;
  exception when others then null;
  end;
  perform public.mod_log(v_id, 'rename', v_reason, v_old || ' → ' || v_new);
  insert into public.mod_notices (user_id, kind, body) values (v_id, 'rename', v_reason || ' (' || v_old || ' → ' || v_new || ')');
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Código de recuperação
-- ---------------------------------------------------------------------
create table public.recovery_codes (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  code_hash   text not null,
  created_at  timestamptz not null default now()
);
create table public.recovery_attempts (
  id            bigint generated always as identity primary key,
  login_key     text not null,
  attempted_at  timestamptz not null default now()
);
create index recovery_attempts_key on public.recovery_attempts (login_key, attempted_at desc);
alter table public.recovery_codes enable row level security;
alter table public.recovery_attempts enable row level security;
revoke all on public.recovery_codes, public.recovery_attempts from public, anon, authenticated;

-- Só letras e números fáceis de ler (sem 0/O, 1/I)
create or replace function public.recovery_normalize(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$ select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- Login feito há no máximo 15 minutos (mesma regra da exclusão de conta)
create or replace function public.recent_login()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz;
begin
  begin
    select s.created_at into v_since from auth.sessions s
    where s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid and s.user_id = (select auth.uid());
  exception when others then v_since := null;
  end;
  return v_since is not null and v_since > now() - interval '15 minutes';
end;
$$;

-- Gera (ou troca) o código. Ele aparece UMA vez; o banco guarda só o hash.
create or replace function public.recovery_code_create()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_abc    text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes  bytea := extensions.gen_random_bytes(16);
  v_code   text := '';
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;
  -- trocar um código que já existe pede login recente (quem pegou o PC aberto não troca)
  if exists (select 1 from public.recovery_codes r where r.user_id = v_me) and not public.recent_login() then
    raise exception 'EOR_REAUTH';
  end if;
  for i in 0..15 loop
    v_code := v_code || substr(v_abc, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  insert into public.recovery_codes (user_id, code_hash, created_at)
  values (v_me, extensions.crypt(v_code, extensions.gen_salt('bf', 8)), now())
  on conflict (user_id) do update set code_hash = excluded.code_hash, created_at = excluded.created_at;
  return substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4) || '-' || substr(v_code, 13, 4);
end;
$$;

-- Usadas SÓ pela Edge Function "recuperar-conta" (chave de serviço).
-- 1) Confere apelido/e-mail + código (5 tentativas por hora por conta)
create or replace function public.recovery_check(p_login text, p_code text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key   text := lower(btrim(coalesce(p_login, '')));
  v_user  uuid;
  v_hash  text;
  v_code  text := public.recovery_normalize(p_code);
begin
  if v_key = '' or char_length(v_key) > 254 then return null; end if;
  if (select count(*) from public.recovery_attempts a
      where a.login_key = v_key and a.attempted_at > now() - interval '1 hour') >= 5 then
    raise exception 'EOR_TOO_MANY';
  end if;
  if position('@' in v_key) > 0 then
    select u.id into v_user from auth.users u where lower(u.email) = v_key;
  else
    select pr.id into v_user from public.profiles pr where lower(pr.nickname) = v_key;
  end if;
  select r.code_hash into v_hash from public.recovery_codes r where r.user_id = v_user;
  if v_hash is null or char_length(v_code) <> 16 or extensions.crypt(v_code, v_hash) <> v_hash then
    insert into public.recovery_attempts (login_key) values (v_key);
    return null;
  end if;
  return json_build_object(
    'user_id', v_user,
    'email', (select u.email from auth.users u where u.id = v_user),
    'nickname', (select pr.nickname from public.profiles pr where pr.id = v_user));
end;
$$;

-- 2) Depois que a função trocou o e-mail/senha: gasta o código, derruba todas as
--    sessões e avisa por e-mail. A 2FA é removida pela própria função (API do Auth).
create or replace function public.recovery_finish(p_user uuid, p_old_email text, p_new_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nick text := (select pr.nickname from public.profiles pr where pr.id = p_user);
begin
  delete from public.recovery_codes r where r.user_id = p_user;
  begin
    delete from auth.sessions s where s.user_id = p_user;
  exception when others then null;
  end;
  if public.email_valid(p_old_email) then
    insert into public.email_outbox (kind, to_email, data)
    values ('recovery_used', p_old_email, jsonb_build_object('nickname', v_nick, 'new_email',
            case when lower(coalesce(p_new_email, '')) <> lower(p_old_email) then p_new_email end));
  end if;
  if public.email_valid(p_new_email) and lower(p_new_email) <> lower(coalesce(p_old_email, '')) then
    insert into public.email_outbox (kind, to_email, data)
    values ('recovery_used', p_new_email, jsonb_build_object('nickname', v_nick));
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 9. Situação da conta (avisos do site e Editar perfil)
-- ---------------------------------------------------------------------
create or replace function public.my_account()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_birth  date;
  v_g      public.account_guardian;
  v_last   timestamptz;
begin
  if v_me is null then return null; end if;
  select pp.birth_date into v_birth from public.profiles_private pp where pp.id = v_me;
  select * into v_g from public.account_guardian g where g.user_id = v_me;
  select max(h.changed_at) into v_last from public.nickname_history h where h.user_id = v_me and not h.by_admin;
  return json_build_object(
    'restriction', public.account_restriction(),
    'guardian', case when v_birth > (current_date - interval '18 years')::date then json_build_object(
                  'status', coalesce(v_g.status, 'pending'),
                  'email', v_g.guardian_email,
                  'sent_at', v_g.sent_at,
                  'expires_at', (select u.created_at from auth.users u where u.id = v_me) + interval '7 days') end,
    'recovery', json_build_object(
                  'has_code', exists (select 1 from public.recovery_codes r where r.user_id = v_me),
                  'created_at', (select r.created_at from public.recovery_codes r where r.user_id = v_me)),
    'nickname_next_change', case when v_last > now() - interval '30 days' then v_last + interval '30 days' end);
end;
$$;

-- ---------------------------------------------------------------------
-- 10. "Baixar meus dados"
-- ---------------------------------------------------------------------
create or replace function public.my_data_export()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;
  return json_build_object(
    'exported_at', now(),
    'account', (select json_build_object('email', u.email, 'created_at', u.created_at)
                from auth.users u where u.id = v_me),
    'profile', (select row_to_json(pr) from public.profiles pr where pr.id = v_me),
    'private', (select json_build_object('birth_date', pp.birth_date, 'terms_version', pp.terms_version,
                                         'terms_accepted_at', pp.terms_accepted_at)
                from public.profiles_private pp where pp.id = v_me),
    'guardian', (select json_build_object('guardian_email', g.guardian_email, 'status', g.status,
                                          'sent_at', g.sent_at, 'decided_at', g.decided_at)
                 from public.account_guardian g where g.user_id = v_me),
    'recovery_code_created_at', (select r.created_at from public.recovery_codes r where r.user_id = v_me),
    'nickname_history', coalesce((select json_agg(json_build_object('old', h.old_nickname, 'new', h.new_nickname,
                                   'by_moderation', h.by_admin, 'at', h.changed_at) order by h.id)
                                  from public.nickname_history h where h.user_id = v_me), '[]'::json),
    'presence', (select json_build_object('last_seen', pz.seen_at) from public.presence pz where pz.user_id = v_me),
    'posts', coalesce((select json_agg(json_build_object('id', p.id, 'tag', p.tag, 'body', p.body,
                         'image_path', p.image_path, 'created_at', p.created_at, 'edited_at', p.edited_at) order by p.id)
                       from public.posts p where p.author = v_me), '[]'::json),
    'comments', coalesce((select json_agg(json_build_object('id', c.id, 'post_id', c.post_id, 'body', c.body,
                            'created_at', c.created_at, 'edited_at', c.edited_at) order by c.id)
                          from public.post_comments c where c.author = v_me), '[]'::json),
    'likes', coalesce((select json_agg(json_build_object('post_id', l.post_id, 'at', l.created_at) order by l.created_at)
                       from public.post_likes l where l.user_id = v_me), '[]'::json),
    'friendships', coalesce((select json_agg(json_build_object(
                       'player', (select pr.nickname from public.profiles pr
                                  where pr.id = case when f.requester = v_me then f.addressee else f.requester end),
                       'status', f.status, 'sent_by_me', f.requester = v_me, 'created_at', f.created_at))
                     from public.friendships f where f.requester = v_me or f.addressee = v_me), '[]'::json),
    'blocks', coalesce((select json_agg(json_build_object('player', pr.nickname, 'at', b.created_at))
                        from public.blocks b join public.profiles pr on pr.id = b.blocked
                        where b.blocker = v_me), '[]'::json),
    'messages', coalesce((select json_agg(json_build_object(
                    'with', (select pr.nickname from public.profiles pr
                             where pr.id = case when m.sender = v_me then m.recipient else m.sender end),
                    'sent_by_me', m.sender = v_me, 'body', m.body, 'at', m.created_at, 'read_at', m.read_at) order by m.id)
                  from public.messages m where m.sender = v_me or m.recipient = v_me), '[]'::json),
    'notifications', coalesce((select json_agg(json_build_object('kind', n.kind, 'post_id', n.post_id,
                         'at', n.created_at, 'read_at', n.read_at) order by n.id)
                       from public.notifications n where n.user_id = v_me), '[]'::json),
    'reports_made', coalesce((select json_agg(x) from (
                       select 'post_or_comment' as type, r.reason, r.status, r.created_at
                       from public.content_reports r where r.reporter = v_me
                       union all
                       select 'message', r.reason, r.status, r.created_at
                       from public.message_reports r where r.reporter = v_me) x), '[]'::json),
    'moderation_notices', coalesce((select json_agg(json_build_object('kind', mn.kind, 'text', mn.body,
                              'until', mn.until_at, 'at', mn.created_at) order by mn.id)
                            from public.mod_notices mn where mn.user_id = v_me), '[]'::json),
    'ban', (select json_build_object('reason', b.reason, 'until', b.banned_until, 'since', b.created_at)
            from public.bans b where b.user_id = v_me));
end;
$$;

-- ---------------------------------------------------------------------
-- 11. Exclusão da conta: quem está suspenso/banido não exclui
--     (senão o banimento sumia junto e a pessoa voltava com o mesmo e-mail)
-- ---------------------------------------------------------------------
create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_nick   text;
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;
  if exists (select 1 from public.user_roles ur where ur.user_id = v_me) then raise exception 'EOR_PROTECTED'; end if;
  if exists (select 1 from public.bans b where b.user_id = v_me and (b.banned_until is null or b.banned_until > now())) then
    raise exception 'EOR_BANNED';
  end if;

  select pr.nickname into v_nick from public.profiles pr where pr.id = v_me;
  if v_nick is null or lower(btrim(coalesce(p_confirm, ''))) <> lower(v_nick) then raise exception 'EOR_CONFIRM'; end if;
  if not public.recent_login() then raise exception 'EOR_REAUTH'; end if;

  if exists (select 1 from storage.objects o
             where o.bucket_id = 'post-images'
               and (o.name like v_me::text || '/%' or o.owner_id = v_me::text)) then
    raise exception 'EOR_IMAGES_LEFT';
  end if;

  delete from auth.users u where u.id = v_me;
end;
$$;

-- account_deletion_check também avisa se a conta está suspensa
create or replace function public.account_deletion_check()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  return json_build_object(
    'recent_login', public.recent_login(),
    'is_admin', exists (select 1 from public.user_roles ur where ur.user_id = v_me),
    'banned', exists (select 1 from public.bans b where b.user_id = v_me and (b.banned_until is null or b.banned_until > now())),
    'images', (select count(*) from storage.objects o
               where o.bucket_id = 'post-images' and o.name like v_me::text || '/%'));
end;
$$;

-- ---------------------------------------------------------------------
-- 12. Permissões
-- ---------------------------------------------------------------------
revoke execute on function
  public.email_send_now(bigint), public.email_outbox_kick(), public.email_claim(bigint),
  public.email_done(bigint, text), public.email_valid(text), public.account_restriction(), public.is_banned(),
  public.nickname_reserved(text, uuid), public.nickname_available(text), public.email_fingerprint(text),
  public.handle_new_user(), public.guardian_send(text), public.guardian_lookup(text),
  public.guardian_respond(text, boolean), public.change_nickname(text), public.admin_rename(text, text, text),
  public.recovery_normalize(text), public.recent_login(), public.recovery_code_create(),
  public.recovery_check(text, text), public.recovery_finish(uuid, text, text),
  public.my_account(), public.my_data_export(), public.delete_my_account(text), public.account_deletion_check()
from public, anon, authenticated;

grant execute on function public.nickname_available(text) to anon, authenticated;
grant execute on function public.guardian_lookup(text), public.guardian_respond(text, boolean) to anon, authenticated;
grant execute on function
  public.is_banned(), public.guardian_send(text), public.change_nickname(text), public.admin_rename(text, text, text),
  public.recovery_code_create(), public.my_account(), public.my_data_export(),
  public.delete_my_account(text), public.account_deletion_check()
to authenticated;
grant execute on function
  public.recovery_check(text, text), public.recovery_finish(uuid, text, text),
  public.email_claim(bigint), public.email_done(bigint, text)
to service_role;

commit;
