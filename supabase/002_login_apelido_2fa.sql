-- =====================================================================
-- Empire of Rebirth & Ruins · v1.1: entrar com apelido + 2FA opcional
-- Rodar UMA vez no SQL Editor (depois do 001_contas_v1.sql).
--
-- 1. Login por apelido: a função abaixo confere a senha DENTRO do banco e
--    só é chamável pelo servidor (Edge Function "login-apelido"), nunca pelo
--    site. O e-mail do jogador nunca sai para o navegador de quem tenta entrar.
--    Limite: 10 senhas erradas por apelido a cada 15 minutos.
-- 2. 2FA: quem ativar o app autenticador só lê os dados privados e edita o
--    perfil depois de digitar o código (sessão "aal2").
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Tentativas de login por apelido (para o limite de tentativas)
-- ---------------------------------------------------------------------
create table public.login_attempts (
  id              bigint generated always as identity primary key,
  nickname_lower  text not null,
  ok              boolean not null,
  attempted_at    timestamptz not null default now()
);
create index login_attempts_lookup on public.login_attempts (nickname_lower, attempted_at desc);

alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from public, anon, authenticated;

-- Confere apelido + senha. Devolve o e-mail se estiver certo; null se não.
create or replace function public.check_nickname_login(p_nick text, p_password text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key    text := lower(btrim(coalesce(p_nick, '')));
  v_fails  int;
  v_email  text;
  v_hash   text;
  v_conf   timestamptz;
begin
  if v_key = '' or p_password is null or length(p_password) > 200 then
    return null;
  end if;

  -- limpeza do histórico antigo
  delete from public.login_attempts where attempted_at < now() - interval '1 day';

  select count(*) into v_fails
  from public.login_attempts
  where nickname_lower = v_key and not ok and attempted_at > now() - interval '15 minutes';
  if v_fails >= 10 then
    raise exception 'EOR_TOO_MANY';
  end if;

  select u.email, u.encrypted_password, u.email_confirmed_at
    into v_email, v_hash, v_conf
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.nickname) = v_key;

  if v_email is null or v_hash is null or v_hash = ''
     or v_hash <> extensions.crypt(p_password, v_hash) then
    insert into public.login_attempts (nickname_lower, ok) values (v_key, false);
    return null;
  end if;

  if v_conf is null then
    raise exception 'EOR_NOT_CONFIRMED';
  end if;

  insert into public.login_attempts (nickname_lower, ok) values (v_key, true);
  return v_email;
end;
$$;

revoke execute on function public.check_nickname_login(text, text) from public, anon, authenticated;
grant execute on function public.check_nickname_login(text, text) to service_role;

-- ---------------------------------------------------------------------
-- 2. 2FA: quem ativou precisa estar com a sessão verificada (aal2)
-- ---------------------------------------------------------------------
create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors
        where user_id = (select auth.uid()) and status = 'verified'
      );
$$;

revoke execute on function public.mfa_satisfied() from public, anon, authenticated;
grant execute on function public.mfa_satisfied() to authenticated;

-- Políticas "restritivas": somam-se às que já existem (todas precisam passar).
create policy "2fa exigido para editar o perfil"
  on public.profiles as restrictive for update
  to authenticated
  using (public.mfa_satisfied())
  with check (public.mfa_satisfied());

create policy "2fa exigido para ler dados privados"
  on public.profiles_private as restrictive for select
  to authenticated
  using (public.mfa_satisfied());

commit;
