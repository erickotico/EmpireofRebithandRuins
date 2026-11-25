-- =====================================================================
-- Empire of Rebirth & Ruins · v1.14: ferramentas de moderação
-- Rodar UMA vez no SQL Editor (depois do 015).
--
--   · Admin (cargo + 2FA, igual ao painel de denúncias) pode, pelo site:
--       - ver a ficha de um jogador (contas, denúncias, punições, últimos posts);
--       - suspender (1 a 365 dias) ou banir de vez, com opção de apagar
--         tudo o que a pessoa postou; desbanir;
--       - mandar um aviso; limpar a bio; tirar o emblema; trocar o apelido.
--   · Ninguém pune um admin pelo site (nem o próprio admin).
--   · Toda ação fica no HISTÓRICO (mod_actions): quem fez, em quem, quando e
--     por quê. O site não consegue editar nem apagar esse histórico.
--     Remoções de post/comentário feitas pelo admin também entram, sozinhas.
--   · O jogador punido vê um aviso no site (mod_notices) com o motivo.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Tabelas (nenhuma permissão direta pelo site)
-- ---------------------------------------------------------------------
create table public.mod_actions (
  id           bigint generated always as identity primary key,
  admin_id     uuid references auth.users (id) on delete set null,
  admin_nick   text,
  target_id    uuid references auth.users (id) on delete set null,
  target_nick  text,                 -- cópia: continua legível se a conta sumir
  action       text not null check (action in
                 ('suspend', 'ban', 'unban', 'warn', 'clear_bio', 'clear_avatar',
                  'rename', 'remove_post', 'remove_comment', 'purge')),
  reason       text not null default '',
  detail       text not null default '',
  created_at   timestamptz not null default now()
);
create index mod_actions_target on public.mod_actions (target_id, id desc);
create index mod_actions_recent on public.mod_actions (id desc);

-- Histórico só cresce: ninguém apaga ou edita por engano.
-- Única exceção: quando uma conta é apagada, a ligação com ela vira vazia
-- (a cópia do apelido continua no registro).
create or replace function public.mod_actions_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
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
create trigger mod_actions_no_change
  before update or delete on public.mod_actions
  for each row execute function public.mod_actions_append_only();

create table public.mod_notices (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('warning', 'suspend', 'ban', 'unban', 'clear_bio', 'clear_avatar', 'rename')),
  body        text not null default '' check (char_length(body) <= 500),
  until_at    timestamptz,
  created_at  timestamptz not null default now(),
  seen_at     timestamptz
);
create index mod_notices_user on public.mod_notices (user_id) where seen_at is null;

alter table public.bans add column if not exists banned_by uuid references auth.users (id) on delete set null;

alter table public.mod_actions enable row level security;
alter table public.mod_notices enable row level security;
revoke all on public.mod_actions, public.mod_notices from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Auxiliares (internas)
-- ---------------------------------------------------------------------
create or replace function public.mod_log(p_target uuid, p_action text, p_reason text, p_detail text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.mod_actions (admin_id, admin_nick, target_id, target_nick, action, reason, detail)
  values ((select auth.uid()),
          (select pr.nickname from public.profiles pr where pr.id = (select auth.uid())),
          p_target,
          (select pr.nickname from public.profiles pr where pr.id = p_target),
          p_action, left(coalesce(p_reason, ''), 300), left(coalesce(p_detail, ''), 300));
end;
$$;

-- Alvo de uma ação: precisa existir e NÃO pode ser admin.
create or replace function public.mod_target(p_nick text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  select pr.id into v_id from public.profiles pr where lower(pr.nickname) = lower(btrim(p_nick));
  if v_id is null then raise exception 'EOR_NOT_FOUND'; end if;
  if exists (select 1 from public.user_roles ur where ur.user_id = v_id) then raise exception 'EOR_PROTECTED'; end if;
  return v_id;
end;
$$;

create or replace function public.mod_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_reason, ''));
begin
  if char_length(v) < 3 then raise exception 'EOR_REASON'; end if;
  return left(v, 300);
end;
$$;

-- Admin removeu post/comentário de outra pessoa (pelo feed ou pelo painel) → histórico
create or replace function public.mod_log_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('eor.skip_mod_log', true), '') = 'on' then return old; end if;
  if pg_trigger_depth() > 1 then return old; end if;          -- comentários apagados junto com o post
  if (select auth.uid()) is null or old.author = (select auth.uid()) or not public.is_admin() then return old; end if;
  perform public.mod_log(old.author,
                         case when tg_table_name = 'posts' then 'remove_post' else 'remove_comment' end,
                         '', left(old.body, 160));
  return old;
end;
$$;
create trigger posts_mod_log after delete on public.posts
  for each row execute function public.mod_log_removal();
create trigger post_comments_mod_log after delete on public.post_comments
  for each row execute function public.mod_log_removal();

-- ---------------------------------------------------------------------
-- 3. Ficha do jogador
-- ---------------------------------------------------------------------
create or replace function public.admin_player(p_nick text)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pr public.profiles;
begin
  if not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  select * into v_pr from public.profiles pr where lower(pr.nickname) = lower(btrim(p_nick));
  if v_pr.id is null then raise exception 'EOR_NOT_FOUND'; end if;
  return json_build_object(
    'nickname',   v_pr.nickname,
    'avatar',     v_pr.avatar,
    'bio',        v_pr.bio,
    'created_at', v_pr.created_at,
    'last_seen',  (select pz.seen_at from public.presence pz where pz.user_id = v_pr.id),
    'is_admin',   exists (select 1 from public.user_roles ur where ur.user_id = v_pr.id),
    'ban', (select json_build_object('reason', b.reason, 'until', b.banned_until, 'since', b.created_at)
            from public.bans b where b.user_id = v_pr.id and (b.banned_until is null or b.banned_until > now())),
    'posts',      (select count(*) from public.posts p where p.author = v_pr.id),
    'comments',   (select count(*) from public.post_comments c where c.author = v_pr.id),
    'reports_against', (select count(*) from public.content_reports r where r.reported = v_pr.id)
                     + (select count(*) from public.message_reports r where r.reported = v_pr.id),
    'reports_removed', (select count(*) from public.content_reports r where r.reported = v_pr.id and r.status = 'removed'),
    'reports_made', (select count(*) from public.content_reports r where r.reporter = v_pr.id)
                  + (select count(*) from public.message_reports r where r.reporter = v_pr.id),
    'history', coalesce((select json_agg(h order by h.id desc) from (
                  select a.id, a.action, a.reason, a.detail, a.admin_nick, a.created_at
                  from public.mod_actions a where a.target_id = v_pr.id order by a.id desc limit 20) h), '[]'::json),
    'recent', coalesce((select json_agg(x order by x.created_at desc) from (
                  (select 'post'::text as kind, p.id as post_id, p.tag, left(p.body, 140) as body, p.image_path is not null as has_image, p.created_at
                   from public.posts p where p.author = v_pr.id order by p.id desc limit 5)
                  union all
                  (select 'comment', c.post_id, (select p2.tag from public.posts p2 where p2.id = c.post_id),
                          left(c.body, 140), false, c.created_at
                   from public.post_comments c where c.author = v_pr.id order by c.id desc limit 5)) x), '[]'::json)
  );
end;
$$;

-- Busca rápida por apelido (com quem está punido marcado)
create or replace function public.admin_find_players(p_query text)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := lower(btrim(coalesce(p_query, '')));
begin
  if not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  if char_length(v_q) < 2 then return '[]'::json; end if;
  return coalesce((select json_agg(x) from (
    select pr.nickname, pr.avatar,
           exists (select 1 from public.bans b where b.user_id = pr.id and (b.banned_until is null or b.banned_until > now())) as banned
    from public.profiles pr
    where lower(pr.nickname) like '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    order by (lower(pr.nickname) = v_q) desc, (lower(pr.nickname) like v_q || '%') desc, pr.nickname
    limit 10) x), '[]'::json);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Punições
-- ---------------------------------------------------------------------
-- p_days: 1–365 = suspensão; null = banimento permanente.
-- p_purge: true apaga TODOS os posts e comentários da pessoa.
-- Devolve os caminhos das imagens apagadas (o site remove os arquivos).
create or replace function public.admin_ban(p_nick text, p_days int, p_reason text, p_purge boolean default false)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid := public.mod_target(p_nick);
  v_reason  text := public.mod_reason(p_reason);
  v_until   timestamptz;
  v_images  text[] := '{}';
  v_posts   int := 0;
  v_comms   int := 0;
begin
  if p_days is not null and (p_days < 1 or p_days > 365) then raise exception 'EOR_INVALID'; end if;
  v_until := case when p_days is null then null else now() + make_interval(days => p_days) end;

  insert into public.bans (user_id, reason, banned_until, created_at, banned_by)
  values (v_id, v_reason, v_until, now(), (select auth.uid()))
  on conflict (user_id) do update
    set reason = excluded.reason, banned_until = excluded.banned_until,
        created_at = excluded.created_at, banned_by = excluded.banned_by;

  perform public.mod_log(v_id, case when p_days is null then 'ban' else 'suspend' end, v_reason,
                         case when p_days is null then '' else p_days || ' dia(s)' end);
  insert into public.mod_notices (user_id, kind, body, until_at)
  values (v_id, case when p_days is null then 'ban' else 'suspend' end, v_reason, v_until);

  if coalesce(p_purge, false) then
    perform set_config('eor.skip_mod_log', 'on', true);
    with d as (delete from public.post_comments c where c.author = v_id returning 1)
      select count(*) into v_comms from d;
    with d as (delete from public.posts p where p.author = v_id returning p.image_path)
      select count(*), coalesce(array_agg(d.image_path) filter (where d.image_path is not null), '{}')
      into v_posts, v_images from d;
    perform set_config('eor.skip_mod_log', 'off', true);
    update public.content_reports r set status = 'removed', resolved_by = (select auth.uid()), resolved_at = now()
    where r.reported = v_id and r.status = 'open';
    perform public.mod_log(v_id, 'purge', v_reason, v_posts || ' post(s), ' || v_comms || ' comentário(s)');
  end if;
  return v_images;
end;
$$;

create or replace function public.admin_unban(p_nick text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid := public.mod_target(p_nick);
  v_reason text := public.mod_reason(p_reason);
begin
  if not exists (select 1 from public.bans b where b.user_id = v_id and (b.banned_until is null or b.banned_until > now())) then
    raise exception 'EOR_NOT_BANNED';
  end if;
  delete from public.bans b where b.user_id = v_id;
  perform public.mod_log(v_id, 'unban', v_reason, '');
  insert into public.mod_notices (user_id, kind, body) values (v_id, 'unban', v_reason);
end;
$$;

create or replace function public.admin_warn(p_nick text, p_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid := public.mod_target(p_nick);
  v_text text := btrim(coalesce(p_text, ''));
begin
  if char_length(v_text) < 3 or char_length(v_text) > 500 then raise exception 'EOR_REASON'; end if;
  perform public.mod_log(v_id, 'warn', v_text, '');
  insert into public.mod_notices (user_id, kind, body) values (v_id, 'warning', v_text);
end;
$$;

-- p_what: 'bio' (apaga a bio) ou 'avatar' (volta para a inicial)
create or replace function public.admin_clear_profile(p_nick text, p_what text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid := public.mod_target(p_nick);
  v_reason text := public.mod_reason(p_reason);
  v_old    text;
begin
  if p_what = 'bio' then
    select pr.bio into v_old from public.profiles pr where pr.id = v_id;
    update public.profiles pr set bio = '' where pr.id = v_id;
  elsif p_what = 'avatar' then
    select pr.avatar into v_old from public.profiles pr where pr.id = v_id;
    update public.profiles pr set avatar = null where pr.id = v_id;
  else
    raise exception 'EOR_INVALID';
  end if;
  perform public.mod_log(v_id, 'clear_' || p_what, v_reason, left(coalesce(v_old, ''), 160));
  insert into public.mod_notices (user_id, kind, body) values (v_id, ('clear_' || p_what), v_reason);
end;
$$;

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
  -- Nome mostrado no topo do site (só visual). Se o banco não deixar, o site corrige sozinho.
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
-- 5. Listas do painel
-- ---------------------------------------------------------------------
create or replace function public.admin_bans_list()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  return coalesce((select json_agg(x order by x.since desc) from (
    select pr.nickname, pr.avatar, b.reason, b.banned_until as until, b.created_at as since,
           (select a.nickname from public.profiles a where a.id = b.banned_by) as by_nick
    from public.bans b join public.profiles pr on pr.id = b.user_id
    where b.banned_until is null or b.banned_until > now()) x), '[]'::json);
end;
$$;

create or replace function public.admin_mod_log(p_before bigint default null, p_limit int default 50)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  return coalesce((select json_agg(x order by x.id desc) from (
    select a.id, a.action, a.reason, a.detail, a.admin_nick, a.target_nick,
           (select pr.nickname from public.profiles pr where pr.id = a.target_id) as target_now,
           a.created_at
    from public.mod_actions a
    where p_before is null or a.id < p_before
    order by a.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)) x), '[]'::json);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. O que o próprio jogador vê (aviso no site)
-- ---------------------------------------------------------------------
create or replace function public.my_moderation()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'nickname', (select pr.nickname from public.profiles pr where pr.id = (select auth.uid())),
    'ban', (select json_build_object('reason', b.reason, 'until', b.banned_until)
            from public.bans b
            where b.user_id = (select auth.uid()) and (b.banned_until is null or b.banned_until > now())),
    'notices', coalesce((select json_agg(n order by n.id) from (
                 select mn.id, mn.kind, mn.body, mn.until_at, mn.created_at
                 from public.mod_notices mn
                 where mn.user_id = (select auth.uid()) and mn.seen_at is null
                 order by mn.id limit 5) n), '[]'::json));
$$;

create or replace function public.ack_mod_notice(p_id bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.mod_notices mn set seen_at = now()
  where mn.id = p_id and mn.user_id = (select auth.uid()) and mn.seen_at is null;
$$;

-- ---------------------------------------------------------------------
-- 7. Permissões
-- ---------------------------------------------------------------------
revoke execute on function
  public.mod_actions_append_only(), public.mod_log(uuid, text, text, text), public.mod_target(text),
  public.mod_reason(text), public.mod_log_removal(),
  public.admin_player(text), public.admin_find_players(text),
  public.admin_ban(text, int, text, boolean), public.admin_unban(text, text), public.admin_warn(text, text),
  public.admin_clear_profile(text, text, text), public.admin_rename(text, text, text),
  public.admin_bans_list(), public.admin_mod_log(bigint, int),
  public.my_moderation(), public.ack_mod_notice(bigint)
from public, anon, authenticated;

-- Só logado; as funções admin_* ainda conferem is_admin() (cargo + 2FA) por dentro.
grant execute on function
  public.admin_player(text), public.admin_find_players(text),
  public.admin_ban(text, int, text, boolean), public.admin_unban(text, text), public.admin_warn(text, text),
  public.admin_clear_profile(text, text, text), public.admin_rename(text, text, text),
  public.admin_bans_list(), public.admin_mod_log(bigint, int),
  public.my_moderation(), public.ack_mod_notice(bigint)
to authenticated;

commit;
