-- =====================================================================
-- Empire of Rebirth & Ruins · v1.15: excluir conta pelo site + prazos de guarda
-- Rodar UMA vez no SQL Editor (depois do 016).
--
--   1. EXCLUIR CONTA (delete_my_account)
--      · Só a própria pessoa, logada há pouco (até 15 min) e com o 2FA, se tiver,
--        digitando o apelido para confirmar.
--      · As imagens são apagadas ANTES pelo site (o Supabase só deixa apagar
--        arquivos pela API de armazenamento). Se sobrar alguma, o banco recusa.
--      · Apaga a conta e, junto, tudo ligado a ela (perfil, posts, comentários,
--        curtidas, amizades, bloqueios, mensagens, notificações, status...).
--      · Fica guardado (sem ligação com a conta): cópias de denúncias CONTRA a
--        pessoa e o histórico de moderação, pelos prazos do item 2.
--      · Admin não exclui a própria conta pelo site (evita ficar sem moderação).
--
--   2. PRAZOS DE GUARDA (faxina automática, roda no máximo a cada 6 horas,
--      puxada pelo sinal de "online" que o site já manda a cada minuto):
--        mensagens privadas .................. 1 ano
--        notificações lidas .................. 90 dias (não lidas: 1 ano)
--        tentativas de login por apelido ..... 1 dia
--        denúncias já resolvidas ............. 1 ano depois de resolvidas
--        avisos da moderação já vistos ....... 90 dias (não vistos: 1 ano)
--        suspensões vencidas ................. 1 ano depois do fim
--        histórico de moderação .............. 2 anos
--        registro de auditoria do login ...... 7 dias (tabela auth.audit_log_entries)
--      Para mudar um prazo: troque o intervalo em run_maintenance() e a
--      Política de privacidade (privacidade.html) junto.
--
--   3. VERSÃO ACEITA (my_privacy): mostra no perfil qual versão dos termos a
--      pessoa aceitou e quando.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Histórico de moderação: continua só crescendo, mas pode perder o que
-- passou do prazo (2 anos).
-- ---------------------------------------------------------------------
create or replace function public.mod_actions_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.created_at < now() - interval '2 years' then
    return old;
  end if;
  if tg_op = 'UPDATE'
     and new.id = old.id
     and (new.admin_id is null or new.admin_id = old.admin_id)
     and (new.target_id is null or new.target_id = old.target_id)
     and new.admin_nick is not distinct from old.admin_nick
     and new.target_nick is not distinct from old.target_nick
     and new.action = old.action and new.reason = old.reason
     and new.detail = old.detail and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'EOR_APPEND_ONLY';
end;
$$;

-- ---------------------------------------------------------------------
-- Faxina
-- ---------------------------------------------------------------------
create table if not exists public.maintenance_runs (
  job       text primary key,
  last_run  timestamptz not null
);
alter table public.maintenance_runs enable row level security;
revoke all on public.maintenance_runs from public, anon, authenticated;

create or replace function public.run_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- uma de cada vez e no máximo a cada 6 horas
  if not pg_try_advisory_xact_lock(hashtext('eor_maintenance')) then return; end if;
  if exists (select 1 from public.maintenance_runs m
             where m.job = 'retention' and m.last_run > now() - interval '6 hours') then
    return;
  end if;

  delete from public.messages m where m.created_at < now() - interval '1 year';
  delete from public.notifications n
   where (n.read_at is not null and n.created_at < now() - interval '90 days')
      or n.created_at < now() - interval '1 year';
  delete from public.login_attempts a where a.attempted_at < now() - interval '1 day';
  delete from public.message_reports r
   where r.status <> 'open' and r.resolved_at < now() - interval '1 year';
  delete from public.content_reports r
   where r.status <> 'open' and r.resolved_at < now() - interval '1 year';
  delete from public.mod_notices n
   where (n.seen_at is not null and n.seen_at < now() - interval '90 days')
      or n.created_at < now() - interval '1 year';
  delete from public.bans b
   where b.banned_until is not null and b.banned_until < now() - interval '1 year';
  delete from public.mod_actions a where a.created_at < now() - interval '2 years';

  -- Registro de auditoria do login (Supabase). Se o banco não deixar, segue sem ele.
  begin
    delete from auth.audit_log_entries e where e.created_at < now() - interval '7 days';
  exception when others then null;
  end;

  insert into public.maintenance_runs (job, last_run) values ('retention', now())
  on conflict (job) do update set last_run = excluded.last_run;
end;
$$;

-- O sinal de "online" (a cada minuto, de quem está com o site aberto) puxa a faxina.
create or replace function public.heartbeat()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null or not public.mfa_satisfied() then return; end if;
  insert into public.presence as pz (user_id, seen_at) values (v_me, now())
  on conflict (user_id) do update set seen_at = now()
  where pz.seen_at < now() - interval '30 seconds';
  begin
    perform public.run_maintenance();
  exception when others then null;          -- a faxina nunca derruba o "online"
  end;
end;
$$;

-- ---------------------------------------------------------------------
-- Versão dos termos aceita (para mostrar no perfil)
-- ---------------------------------------------------------------------
create or replace function public.my_privacy()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'terms_version', pp.terms_version,
    'terms_accepted_at', pp.terms_accepted_at,
    'current_version', public.current_terms_version())
  from public.profiles_private pp
  where pp.id = (select auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Excluir a própria conta
-- ---------------------------------------------------------------------
-- Devolve quanto tempo falta para o login "recente" vencer (para o site avisar).
create or replace function public.account_deletion_check()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_since  timestamptz;
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  begin
    select s.created_at into v_since from auth.sessions s
    where s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid and s.user_id = v_me;
  exception when others then v_since := null;
  end;
  return json_build_object(
    'recent_login', v_since is not null and v_since > now() - interval '15 minutes',
    'is_admin', exists (select 1 from public.user_roles ur where ur.user_id = v_me),
    'images', (select count(*) from storage.objects o
               where o.bucket_id = 'post-images' and o.name like v_me::text || '/%'));
end;
$$;

create or replace function public.delete_my_account(p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_nick   text;
  v_since  timestamptz;
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;
  if exists (select 1 from public.user_roles ur where ur.user_id = v_me) then raise exception 'EOR_PROTECTED'; end if;

  select pr.nickname into v_nick from public.profiles pr where pr.id = v_me;
  if v_nick is null or lower(btrim(coalesce(p_confirm, ''))) <> lower(v_nick) then raise exception 'EOR_CONFIRM'; end if;

  -- login recente: senha (e 2FA) digitados há no máximo 15 minutos
  select s.created_at into v_since from auth.sessions s
  where s.id = nullif((select auth.jwt()) ->> 'session_id', '')::uuid and s.user_id = v_me;
  if v_since is null or v_since < now() - interval '15 minutes' then raise exception 'EOR_REAUTH'; end if;

  -- as imagens precisam ter sido apagadas antes, pela API de armazenamento
  if exists (select 1 from storage.objects o
             where o.bucket_id = 'post-images'
               and (o.name like v_me::text || '/%' or o.owner_id = v_me::text)) then
    raise exception 'EOR_IMAGES_LEFT';
  end if;

  delete from auth.users u where u.id = v_me;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function
  public.run_maintenance(), public.my_privacy(),
  public.account_deletion_check(), public.delete_my_account(text)
from public, anon, authenticated;

grant execute on function
  public.my_privacy(), public.account_deletion_check(), public.delete_my_account(text)
to authenticated;

commit;

-- ---------------------------------------------------------------------
-- (Opcional) Se um dia ativar o pg_cron (Database → Integrations → Cron),
-- a faxina pode rodar todo dia às 4h mesmo sem ninguém no site:
--   select cron.schedule('eor-faxina', '0 4 * * *', $$ select public.run_maintenance() $$);
-- ---------------------------------------------------------------------
