-- =====================================================================
-- Empire of Rebirth & Ruins · v1.17: comunidade e moderação
-- Rodar UMA vez no SQL Editor, logo depois do 018.
--
--   · Post apagado que tem comentários de OUTRAS pessoas vira
--     "Publicação removida": o texto, a imagem e as curtidas somem, mas os
--     comentários dos outros continuam. O mesmo vale para um comentário que
--     tem respostas de outras pessoas ("Comentário removido").
--     Vale para quem apaga, para a moderação e para conta excluída.
--     Quando o último comentário dos outros some, o "removido" some também.
--   · Denúncias têm categoria; as graves (menores, ameaça, risco de
--     autolesão, golpe, exposição de dados) vão para o topo do painel e
--     mandam um alerta por e-mail para o admin.
--   · Denúncias continuam guardadas se quem denunciou excluir a conta
--     (sem mostrar quem foi).
--   · Punições com tabela fixa: 1, 3, 7 ou 30 dias, ou permanente.
--     O e-mail de quem é punido fica barrado para cadastro enquanto durar.
--   · Conta excluída (pelo site ou pelo painel) → e-mail de confirmação.
--   · Faxina: novos prazos (sessões paradas 90 dias, fila de e-mails 7 dias,
--     contas de 16/17 anos sem autorização, etc.).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Posts e comentários "removidos"
-- ---------------------------------------------------------------------
alter table public.posts add column removed_at timestamptz;
alter table public.posts alter column author drop not null;
alter table public.posts drop constraint posts_author_fkey;
alter table public.posts add constraint posts_author_fkey
  foreign key (author) references auth.users (id) on delete set null;
alter table public.posts drop constraint posts_check;
alter table public.posts add constraint posts_content_check
  check (removed_at is not null or char_length(btrim(body)) > 0 or image_path is not null);
alter table public.posts add constraint posts_author_check
  check (author is not null or removed_at is not null);

alter table public.post_comments add column removed_at timestamptz;
alter table public.post_comments alter column author drop not null;
alter table public.post_comments drop constraint post_comments_author_fkey;
alter table public.post_comments add constraint post_comments_author_fkey
  foreign key (author) references auth.users (id) on delete set null;
alter table public.post_comments drop constraint post_comments_body_check;
alter table public.post_comments add constraint post_comments_body_check
  check (removed_at is not null or char_length(body) between 1 and 1000);
alter table public.post_comments add constraint post_comments_author_check
  check (author is not null or removed_at is not null);

-- Remove (ou deixa só o "removido") — interno, sem checar permissão.
-- Devolve o caminho da imagem para o site apagar o arquivo.
create or replace function public.remove_post_internal(p_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_post public.posts;
begin
  select * into v_post from public.posts p where p.id = p_id for update;
  if v_post.id is null or v_post.removed_at is not null then return null; end if;
  if exists (select 1 from public.post_comments c
             where c.post_id = p_id and c.removed_at is null and c.author is distinct from v_post.author) then
    delete from public.post_likes l where l.post_id = p_id;
    delete from public.notifications n where n.post_id = p_id and n.kind = 'like';
    update public.posts p
       set removed_at = now(), author = null, body = '', image_path = null, pinned = false,
           like_count = 0, edited_at = null
     where p.id = p_id;
  else
    delete from public.posts p where p.id = p_id;
  end if;
  return v_post.image_path;
end;
$$;

-- Apaga "removidos" que ficaram sem nada dos outros
create or replace function public.prune_removed(p_post bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.post_comments c
   where c.post_id = p_post and c.removed_at is not null
     and not exists (select 1 from public.post_comments r where r.parent_id = c.id and r.removed_at is null);
  delete from public.posts p
   where p.id = p_post and p.removed_at is not null
     and not exists (select 1 from public.post_comments c where c.post_id = p_post and c.removed_at is null);
end;
$$;

create or replace function public.remove_comment_internal(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.post_comments;
begin
  select * into v_c from public.post_comments c where c.id = p_id for update;
  if v_c.id is null or v_c.removed_at is not null then return; end if;
  if v_c.parent_id is null and exists (
       select 1 from public.post_comments r
       where r.parent_id = p_id and r.removed_at is null and r.author is distinct from v_c.author) then
    update public.post_comments c set removed_at = now(), author = null, body = '', edited_at = null where c.id = p_id;
    update public.posts p set best_comment = null where p.best_comment = p_id;
    delete from public.notifications n where n.comment_id = p_id;
  else
    delete from public.post_comments c where c.id = p_id;
  end if;
  perform public.prune_removed(v_c.post_id);
end;
$$;

-- Histórico de moderação: agora também registra o "removido" (update)
create or replace function public.mod_log_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('eor.skip_mod_log', true), '') = 'on' then return null; end if;
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'DELETE' and old.removed_at is not null then return null; end if;      -- faxina de "removido"
  if tg_op = 'UPDATE' and not (old.removed_at is null and new.removed_at is not null) then return null; end if;
  if (select auth.uid()) is null or old.author is null or old.author = (select auth.uid()) or not public.is_admin() then
    return null;
  end if;
  perform public.mod_log(old.author,
                         case when tg_table_name = 'posts' then 'remove_post' else 'remove_comment' end,
                         '', left(old.body, 160));
  return null;
end;
$$;
create trigger posts_mod_log_removed after update of removed_at on public.posts
  for each row execute function public.mod_log_removal();
create trigger post_comments_mod_log_removed after update of removed_at on public.post_comments
  for each row execute function public.mod_log_removal();

-- ---------------------------------------------------------------------
-- 2. Apagar (jogador, dono do post ou admin)
-- ---------------------------------------------------------------------
create or replace function public.delete_post(p_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_post   public.posts;
  v_image  text;
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;
  select * into v_post from public.posts p where p.id = p_id;
  if v_post.id is null or v_post.removed_at is not null then raise exception 'EOR_NOT_FOUND'; end if;
  if v_post.author is distinct from v_me and not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  v_image := public.remove_post_internal(p_id);
  if v_post.author is distinct from v_me then
    update public.content_reports r set status = 'removed', resolved_by = v_me, resolved_at = now()
    where r.post_id = p_id and r.status = 'open';
  end if;
  return v_image;
end;
$$;

create or replace function public.delete_comment(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me       uuid := (select auth.uid());
  v_comment  public.post_comments;
  v_owner    uuid;
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;
  select * into v_comment from public.post_comments c where c.id = p_id;
  if v_comment.id is null or v_comment.removed_at is not null then raise exception 'EOR_NOT_FOUND'; end if;
  select p.author into v_owner from public.posts p where p.id = v_comment.post_id;
  if v_comment.author is distinct from v_me and v_owner is distinct from v_me and not public.is_admin() then
    raise exception 'EOR_FORBIDDEN';
  end if;
  perform public.remove_comment_internal(p_id);
  if v_comment.author is distinct from v_me and public.is_admin() then
    update public.content_reports r set status = 'removed', resolved_by = v_me, resolved_at = now()
    where r.comment_id = p_id and r.status = 'open';
  end if;
end;
$$;

-- Editar / melhor resposta: "removido" não pode ser mexido
create or replace function public.edit_post(p_id bigint, p_body text, p_tag text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := public.assert_can_write();
  v_post  public.posts;
  v_body  text := btrim(coalesce(p_body, ''));
  v_tag   text;
begin
  select * into v_post from public.posts p where p.id = p_id;
  if v_post.id is null or v_post.removed_at is not null or v_post.author is distinct from v_me then
    raise exception 'EOR_NOT_FOUND';
  end if;
  v_tag := coalesce(nullif(p_tag, ''), v_post.tag);
  if v_tag not in ('geral', 'pergunta', 'dica', 'arte', 'anuncio') then raise exception 'EOR_INVALID'; end if;
  if v_tag = 'anuncio' and v_post.tag <> 'anuncio' and not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  if char_length(v_body) > 2000 then raise exception 'EOR_TOO_LONG'; end if;
  if char_length(v_body) = 0 and v_post.image_path is null then raise exception 'EOR_EMPTY'; end if;
  update public.posts p
     set body = v_body, tag = v_tag, edited_at = now(),
         best_comment = case when v_tag = 'pergunta' then p.best_comment end
   where p.id = p_id;
end;
$$;

create or replace function public.set_best_answer(p_post bigint, p_comment bigint default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me       uuid := public.assert_can_write();
  v_post     public.posts;
  v_c_author uuid;
begin
  select * into v_post from public.posts p where p.id = p_post;
  if v_post.id is null or v_post.removed_at is not null or v_post.author is distinct from v_me then
    raise exception 'EOR_NOT_FOUND';
  end if;
  if v_post.tag <> 'pergunta' then raise exception 'EOR_INVALID'; end if;

  if p_comment is null then
    update public.posts p set best_comment = null where p.id = p_post;
    return;
  end if;

  select c.author into v_c_author from public.post_comments c
  where c.id = p_comment and c.post_id = p_post and c.removed_at is null;
  if v_c_author is null then raise exception 'EOR_NOT_FOUND'; end if;
  if public.blocked_between(v_me, v_c_author) then raise exception 'EOR_BLOCKED'; end if;

  update public.posts p set best_comment = p_comment where p.id = p_post;
  if v_c_author <> v_me then
    delete from public.notifications n where n.kind = 'best' and n.post_id = p_post;
    insert into public.notifications (user_id, actor, kind, post_id, comment_id)
    values (v_c_author, v_me, 'best', p_post, p_comment);
  end if;
end;
$$;

-- Insígnia "Ajudante" continua valendo se a pergunta for removida depois
create or replace function public.player_stats(p_nick text)
returns table (best_answers int, posts int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.user_by_nick(p_nick);
begin
  if v_user is null then return; end if;
  return query
    select
      (select count(*)::int
         from public.posts p
         join public.post_comments c on c.id = p.best_comment
        where p.tag = 'pergunta' and c.author = v_user and p.author is distinct from v_user),
      (select count(*)::int from public.posts p where p.author = v_user);
end;
$$;

create or replace function public.top_helpers(p_limit int default 5)
returns table (nickname text, avatar text, best_answers int)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.nickname, pr.avatar, count(*)::int
  from public.posts p
  join public.post_comments c on c.id = p.best_comment
  join public.profiles pr on pr.id = c.author
  where p.tag = 'pergunta' and p.author is distinct from c.author
  group by pr.id, pr.nickname, pr.avatar
  order by count(*) desc, pr.nickname
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$$;

-- ---------------------------------------------------------------------
-- 3. Leitura: feed e comentários mostram os "removidos"
-- ---------------------------------------------------------------------
drop function public.feed(bigint, int, text, text, bigint, text, boolean, text[], boolean);

create function public.feed(
  p_before bigint default null, p_limit int default 20,
  p_tag text default null, p_author_nick text default null, p_post bigint default null,
  p_query text default null, p_unsolved boolean default false, p_tags text[] default null,
  p_friends boolean default false)
returns table (
  id bigint, nickname text, avatar text, tag text, body text, image_path text, pinned boolean,
  like_count int, comment_count int, created_at timestamptz, edited_at timestamptz,
  liked boolean, mine boolean,
  best_comment bigint, best_nickname text, best_avatar text, best_body text,
  removed boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me       uuid := (select auth.uid());
  v_author   uuid;
  v_query    text := nullif(btrim(coalesce(p_query, '')), '');
  v_friends  boolean := coalesce(p_friends, false);
  v_general  boolean;
  v_filtered boolean;
begin
  if v_query is not null and char_length(v_query) < 2 then return; end if;
  if char_length(coalesce(v_query, '')) > 60 then v_query := left(v_query, 60); end if;
  if p_tags is not null and cardinality(p_tags) > 5 then return; end if;
  if v_friends and v_me is null then return; end if;
  v_general := p_author_nick is null and p_post is null and v_query is null
               and not coalesce(p_unsolved, false) and not v_friends;
  -- perfil, busca, amigos e "sem solução" não mostram publicações removidas
  v_filtered := p_author_nick is not null or v_query is not null or coalesce(p_unsolved, false) or v_friends;

  if p_author_nick is not null then
    v_author := public.user_by_nick(p_author_nick);
    if v_author is null then return; end if;
  end if;

  return query
    select p.id, pr.nickname, pr.avatar, p.tag, p.body, p.image_path, p.pinned,
           p.like_count, p.comment_count, p.created_at, p.edited_at,
           (v_me is not null and exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = v_me)),
           coalesce(v_me is not null and p.author = v_me, false),
           bc.id, bpr.nickname, bpr.avatar, bc.body,
           p.removed_at is not null
    from public.posts p
    left join public.profiles pr on pr.id = p.author
    left join public.post_comments bc on bc.id = p.best_comment and p.tag = 'pergunta' and bc.removed_at is null
    left join public.profiles bpr on bpr.id = bc.author
    where (p_post is null or p.id = p_post)
      and (not v_filtered or p.removed_at is null)
      and (v_author is null or p.author = v_author)
      and (p_tag is null or p.tag = p_tag)
      and (p_tags is null or p.tag = any (p_tags))
      and (not coalesce(p_unsolved, false) or (p.tag = 'pergunta' and p.best_comment is null))
      and (not v_friends or p.author = v_me or public.are_friends(v_me, p.author))
      and (v_query is null or p.body ilike public.like_pattern(v_query) or pr.nickname ilike public.like_pattern(v_query))
      and (v_me is null or p.author is null or p.author = v_me or not public.blocked_between(v_me, p.author))
      and (p_before is null or p.id < p_before)
      and (not v_general or p_before is null or not p.pinned)
    order by (v_general and p.pinned) desc, p.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

drop function public.post_comments_list(bigint, bigint, int);

create function public.post_comments_list(p_post bigint, p_before bigint default null, p_limit int default 20)
returns table (id bigint, parent_id bigint, nickname text, avatar text, body text, created_at timestamptz, edited_at timestamptz,
               mine boolean, can_delete boolean, is_best boolean, can_mark_best boolean, removed boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me       uuid := (select auth.uid());
  v_author   uuid;
  v_removed  boolean;
  v_admin    boolean := public.is_admin();
  v_best     bigint;
  v_tag      text;
begin
  select p.author, p.removed_at is not null, p.best_comment, p.tag
    into v_author, v_removed, v_best, v_tag
  from public.posts p where p.id = p_post;
  if v_removed is null then raise exception 'EOR_NOT_FOUND'; end if;
  if not v_removed then perform public.post_author_visible(p_post); end if;   -- bloqueio entre os dois

  return query
    with top as (
      select c.id as tid
      from public.post_comments c
      where c.post_id = p_post and c.parent_id is null
        and (p_before is null or c.id < p_before)
        and (v_me is null or c.author is null or c.author = v_me or not public.blocked_between(v_me, c.author))
      order by c.id desc
      limit least(greatest(coalesce(p_limit, 20), 1), 50)
    )
    select c.id, c.parent_id, pr.nickname, pr.avatar, c.body, c.created_at, c.edited_at,
           coalesce(v_me is not null and c.author = v_me, false),
           coalesce(c.removed_at is null and v_me is not null and (c.author = v_me or v_author = v_me or v_admin), false),
           coalesce(v_tag = 'pergunta' and c.id = v_best, false),
           coalesce(v_me is not null and not v_removed and v_tag = 'pergunta' and v_author = v_me, false),
           c.removed_at is not null
    from public.post_comments c
    left join public.profiles pr on pr.id = c.author
    where c.post_id = p_post
      and (c.id in (select tid from top) or c.parent_id in (select tid from top))
      and (v_me is null or c.author is null or c.author = v_me or not public.blocked_between(v_me, c.author))
    order by coalesce(c.parent_id, c.id) desc, c.parent_id nulls first, c.id
    limit 500;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Denúncias: categoria, urgência, e continuam se quem denunciou sair
-- ---------------------------------------------------------------------
alter table public.content_reports alter column reporter drop not null;
alter table public.content_reports drop constraint content_reports_reporter_fkey;
alter table public.content_reports add constraint content_reports_reporter_fkey
  foreign key (reporter) references auth.users (id) on delete set null;
alter table public.message_reports alter column reporter drop not null;
alter table public.message_reports drop constraint message_reports_reporter_fkey;
alter table public.message_reports add constraint message_reports_reporter_fkey
  foreign key (reporter) references auth.users (id) on delete set null;

alter table public.content_reports
  add column category text not null default 'outro',
  add column urgent boolean not null default false;
alter table public.message_reports
  add column category text not null default 'outro',
  add column urgent boolean not null default false;

create or replace function public.report_category_ok(p_category text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_category in ('spam', 'ofensa', 'assedio', 'sexual', 'menor', 'ameaca', 'autolesao',
                        'golpe', 'dados', 'trapaca', 'outro');
$$;
-- Graves = vão para o topo e geram alerta por e-mail
create or replace function public.report_category_urgent(p_category text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_category in ('menor', 'ameaca', 'autolesao', 'golpe', 'dados'); $$;

alter table public.content_reports add constraint content_reports_category_check check (public.report_category_ok(category));
alter table public.message_reports add constraint message_reports_category_check check (public.report_category_ok(category));
create index content_reports_urgent on public.content_reports (created_at) where status = 'open' and urgent;
create index message_reports_urgent on public.message_reports (created_at) where status = 'open' and urgent;

-- No máximo 30 alertas por dia (para um ataque de denúncias não lotar a caixa de entrada)
create table public.alert_counter (
  day   date primary key,
  sent  int not null default 0
);
alter table public.alert_counter enable row level security;
revoke all on public.alert_counter from public, anon, authenticated;

create or replace function public.report_alert(p_source text, p_category text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sent int;
begin
  insert into public.alert_counter as a (day, sent) values (current_date, 1)
  on conflict (day) do update set sent = a.sent + 1
  returning a.sent into v_sent;
  if v_sent > 30 then return; end if;
  -- o alerta não leva o conteúdo denunciado: só o tipo e a categoria
  insert into public.email_outbox (kind, to_email, data)
  select 'urgent_report', u.email, jsonb_build_object('source', p_source, 'category', p_category)
  from public.user_roles ur join auth.users u on u.id = ur.user_id
  where ur.role = 'admin' and public.email_valid(u.email);
end;
$$;

drop function public.report_content(bigint, bigint, text);
create function public.report_content(p_post bigint default null, p_comment bigint default null,
                                      p_reason text default '', p_category text default 'outro')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me      uuid := public.assert_can_write();
  v_author  uuid;
  v_body    text;
  v_image   text;
  v_post    bigint := p_post;
  v_cat     text := coalesce(nullif(btrim(p_category), ''), 'outro');
  v_urgent  boolean;
  v_new     bigint;
begin
  if (p_post is null) = (p_comment is null) then raise exception 'EOR_INVALID'; end if;
  if not public.report_category_ok(v_cat) then raise exception 'EOR_INVALID'; end if;
  v_urgent := public.report_category_urgent(v_cat);
  if (select count(*) from public.content_reports r where r.reporter = v_me and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'EOR_TOO_MANY';
  end if;
  if p_comment is not null then
    select c.author, c.body, c.post_id into v_author, v_body, v_post from public.post_comments c where c.id = p_comment;
  else
    select p.author, p.body, p.image_path into v_author, v_body, v_image from public.posts p where p.id = p_post;
  end if;
  if v_author is null or v_author = v_me then raise exception 'EOR_NOT_FOUND'; end if;

  insert into public.content_reports (reporter, reported, post_id, comment_id, body_copy, image_copy, reason, category, urgent)
  values (v_me, v_author, v_post, p_comment, coalesce(v_body, ''), v_image, left(btrim(coalesce(p_reason, '')), 300),
          v_cat, v_urgent)
  on conflict do nothing
  returning id into v_new;
  if v_new is not null and v_urgent then
    perform public.report_alert(case when p_comment is null then 'post' else 'comment' end, v_cat);
  end if;
end;
$$;

drop function public.report_message(bigint, text);
create function public.report_message(p_id bigint, p_reason text default '', p_category text default 'outro')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_m       public.messages;
  v_cat     text := coalesce(nullif(btrim(p_category), ''), 'outro');
  v_urgent  boolean;
  v_new     bigint;
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;
  if not public.report_category_ok(v_cat) then raise exception 'EOR_INVALID'; end if;
  v_urgent := public.report_category_urgent(v_cat);
  select * into v_m from public.messages m where m.id = p_id and m.recipient = v_me;
  if not found then raise exception 'EOR_NOT_FOUND'; end if;
  if (select count(*) from public.message_reports r where r.reporter = v_me and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'EOR_TOO_MANY';
  end if;
  insert into public.message_reports (message_id, reporter, reported, body_copy, reason, message_at, category, urgent)
  values (v_m.id, v_me, v_m.sender, v_m.body, left(btrim(coalesce(p_reason, '')), 300), v_m.created_at, v_cat, v_urgent)
  on conflict (message_id, reporter) do nothing
  returning id into v_new;
  if v_new is not null and v_urgent then
    perform public.report_alert('message', v_cat);
  end if;
end;
$$;

drop function public.admin_open_reports();
create function public.admin_open_reports()
returns table (source text, id bigint, reporter text, reported text, body text, image_path text,
               reason text, created_at timestamptz, post_id bigint, still_exists boolean,
               category text, urgent boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  return query
    select 'message'::text, r.id, rp.nickname, rd.nickname, r.body_copy, null::text, r.reason, r.created_at,
           null::bigint, exists (select 1 from public.messages m where m.id = r.message_id),
           r.category, r.urgent
    from public.message_reports r
    left join public.profiles rp on rp.id = r.reporter
    left join public.profiles rd on rd.id = r.reported
    where r.status = 'open'
    union all
    select case when r.comment_id is null then 'post' else 'comment' end, r.id, rp.nickname, rd.nickname,
           r.body_copy, r.image_copy, r.reason, r.created_at, r.post_id,
           case when r.comment_id is null
                then exists (select 1 from public.posts p where p.id = r.post_id and p.removed_at is null)
                else exists (select 1 from public.post_comments c where c.id = r.comment_id and c.removed_at is null) end,
           r.category, r.urgent
    from public.content_reports r
    left join public.profiles rp on rp.id = r.reporter
    left join public.profiles rd on rd.id = r.reported
    where r.status = 'open'
    order by 12 desc, 8
    limit 200;
end;
$$;

create or replace function public.admin_resolve_report(p_source text, p_id bigint, p_action text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_status  text;
  v_report  public.content_reports;
  v_image   text;
begin
  if not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  if p_action not in ('dismiss', 'remove') then raise exception 'EOR_INVALID'; end if;
  v_status := case when p_action = 'remove' then 'removed' else 'dismissed' end;

  if p_source = 'message' then
    update public.message_reports r set status = v_status, resolved_by = v_me, resolved_at = now()
    where r.id = p_id and r.status = 'open';
    return null;
  end if;

  select * into v_report from public.content_reports r where r.id = p_id;
  if v_report.id is null then raise exception 'EOR_NOT_FOUND'; end if;

  if p_action = 'remove' then
    if v_report.comment_id is not null then
      perform public.remove_comment_internal(v_report.comment_id);
      update public.content_reports r set status = 'removed', resolved_by = v_me, resolved_at = now()
      where r.comment_id = v_report.comment_id and r.status = 'open';
    else
      v_image := public.remove_post_internal(v_report.post_id);
      update public.content_reports r set status = 'removed', resolved_by = v_me, resolved_at = now()
      where r.post_id = v_report.post_id and r.comment_id is null and r.status = 'open';
    end if;
  end if;
  update public.content_reports r set status = v_status, resolved_by = v_me, resolved_at = now()
  where r.id = p_id and r.status = 'open';
  return v_image;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Punições: tabela fixa + e-mail barrado enquanto durar
-- ---------------------------------------------------------------------
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
  v_image   text;
  v_posts   int := 0;
  v_comms   int := 0;
  v_row         record;
begin
  if p_days is not null and p_days not in (1, 3, 7, 30) then raise exception 'EOR_INVALID'; end if;
  v_until := case when p_days is null then null else now() + make_interval(days => p_days) end;

  insert into public.bans (user_id, reason, banned_until, created_at, banned_by)
  values (v_id, v_reason, v_until, now(), (select auth.uid()))
  on conflict (user_id) do update
    set reason = excluded.reason, banned_until = excluded.banned_until,
        created_at = excluded.created_at, banned_by = excluded.banned_by;

  insert into public.banned_emails (email_hash, user_id, until_at)
  select public.email_fingerprint(u.email), v_id, v_until from auth.users u
  where u.id = v_id and public.email_fingerprint(u.email) is not null
  on conflict (email_hash) do update set user_id = excluded.user_id, until_at = excluded.until_at;

  perform public.mod_log(v_id, case when p_days is null then 'ban' else 'suspend' end, v_reason,
                         case when p_days is null then '' else p_days || ' dia(s)' end);
  insert into public.mod_notices (user_id, kind, body, until_at)
  values (v_id, case when p_days is null then 'ban' else 'suspend' end, v_reason, v_until);

  if coalesce(p_purge, false) then
    perform set_config('eor.skip_mod_log', 'on', true);
    for v_row in select c.id from public.post_comments c where c.author = v_id and c.removed_at is null order by c.id desc loop
      perform public.remove_comment_internal(v_row.id);
      v_comms := v_comms + 1;
    end loop;
    for v_row in select p.id from public.posts p where p.author = v_id order by p.id loop
      v_image := public.remove_post_internal(v_row.id);
      v_posts := v_posts + 1;
      if v_image is not null then v_images := v_images || v_image; end if;
    end loop;
    perform set_config('eor.skip_mod_log', 'off', true);
    update public.content_reports r2 set status = 'removed', resolved_by = (select auth.uid()), resolved_at = now()
    where r2.reported = v_id and r2.status = 'open';
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
  delete from public.banned_emails be where be.user_id = v_id;
  perform public.mod_log(v_id, 'unban', v_reason, '');
  insert into public.mod_notices (user_id, kind, body) values (v_id, 'unban', v_reason);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Conta excluída (pelo site, pela faxina ou pelo painel do Supabase)
--    Antes de apagar: posts/comentários viram "removido" onde há conteúdo
--    dos outros, e sai o e-mail de confirmação.
-- ---------------------------------------------------------------------
create or replace function public.on_account_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row         record;
  v_reason  text := coalesce(current_setting('eor.delete_reason', true), '');
  v_nick    text := (select pr.nickname from public.profiles pr where pr.id = old.id);
begin
  perform set_config('eor.skip_mod_log', 'on', true);
  for v_row in select c.id from public.post_comments c where c.author = old.id and c.removed_at is null order by c.id desc loop
    perform public.remove_comment_internal(v_row.id);
  end loop;
  for v_row in select p.id from public.posts p where p.author = old.id order by p.id loop
    perform public.remove_post_internal(v_row.id);
  end loop;
  perform set_config('eor.skip_mod_log', 'off', true);

  if old.email_confirmed_at is not null and public.email_valid(old.email) then
    insert into public.email_outbox (kind, to_email, data)
    values (case when v_reason = 'guardian' then 'account_removed_guardian' else 'account_deleted' end,
            old.email, jsonb_build_object('nickname', v_nick));
  end if;
  return old;
end;
$$;
create trigger on_auth_user_deleting before delete on auth.users
  for each row execute function public.on_account_delete();

-- ---------------------------------------------------------------------
-- 7. Faxina (substitui a do 017; mesma regra: no máximo a cada 6 horas)
-- ---------------------------------------------------------------------
create or replace function public.run_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
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
  delete from public.recovery_attempts a where a.attempted_at < now() - interval '1 day';
  delete from public.message_reports r
   where r.status <> 'open' and r.resolved_at < now() - interval '1 year';
  delete from public.content_reports r
   where r.status <> 'open' and r.resolved_at < now() - interval '1 year';
  delete from public.mod_notices n
   where (n.seen_at is not null and n.seen_at < now() - interval '90 days')
      or n.created_at < now() - interval '1 year';
  delete from public.bans b
   where b.banned_until is not null and b.banned_until < now() - interval '1 year';
  delete from public.banned_emails be where be.until_at is not null and be.until_at < now();
  delete from public.mod_actions a where a.created_at < now() - interval '2 years';
  delete from public.nickname_history h where h.changed_at < now() - interval '1 year';
  delete from public.alert_counter a where a.day < current_date - 7;

  -- "removidos" que ficaram sem nada dos outros
  delete from public.post_comments c
   where c.removed_at is not null
     and not exists (select 1 from public.post_comments x where x.parent_id = c.id and x.removed_at is null);
  delete from public.posts p
   where p.removed_at is not null
     and not exists (select 1 from public.post_comments c where c.post_id = p.id and c.removed_at is null);

  -- fila de e-mails: reenvia o que travou; apaga o que não saiu em 7 dias
  delete from public.email_outbox o where o.created_at < now() - interval '7 days';
  for v_row in select o.id from public.email_outbox o
           where o.attempts < 5 and o.created_at < now() - interval '10 minutes'
             and (o.claimed_at is null or o.claimed_at < now() - interval '10 minutes')
           order by o.id limit 20 loop
    update public.email_outbox o set claimed_at = null where o.id = v_row.id;
    perform public.email_send_now(v_row.id);
  end loop;

  -- 16/17 anos sem autorização: 7 dias depois do cadastro (ou 1 dia depois da recusa)
  begin
    perform set_config('eor.delete_reason', 'guardian', true);
    delete from auth.users u
     where u.id in (
       select g.user_id from public.account_guardian g
       join auth.users u2 on u2.id = g.user_id
       join public.profiles_private pp on pp.id = g.user_id
       where pp.birth_date > (current_date - interval '18 years')::date
         and not exists (select 1 from public.user_roles ur where ur.user_id = g.user_id)
         and ((g.status = 'pending' and u2.created_at < now() - interval '7 days')
              or (g.status = 'denied' and g.decided_at < now() - interval '1 day')));
    perform set_config('eor.delete_reason', '', true);
  exception when others then
    perform set_config('eor.delete_reason', '', true);
  end;

  -- Dados técnicos do login (Supabase). Se o banco não deixar, segue sem eles.
  begin
    delete from auth.audit_log_entries e where e.created_at < now() - interval '7 days';
  exception when others then null;
  end;
  begin
    delete from auth.sessions s where coalesce(s.updated_at, s.created_at) < now() - interval '90 days';
  exception when others then null;
  end;

  insert into public.maintenance_runs (job, last_run) values ('retention', now())
  on conflict (job) do update set last_run = excluded.last_run;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Permissões
-- ---------------------------------------------------------------------
revoke execute on function
  public.remove_post_internal(bigint), public.prune_removed(bigint), public.remove_comment_internal(bigint),
  public.mod_log_removal(), public.delete_post(bigint), public.delete_comment(bigint),
  public.edit_post(bigint, text, text), public.set_best_answer(bigint, bigint),
  public.player_stats(text), public.top_helpers(int),
  public.feed(bigint, int, text, text, bigint, text, boolean, text[], boolean),
  public.post_comments_list(bigint, bigint, int),
  public.report_category_ok(text), public.report_category_urgent(text), public.report_alert(text, text),
  public.report_content(bigint, bigint, text, text), public.report_message(bigint, text, text),
  public.admin_open_reports(), public.admin_resolve_report(text, bigint, text),
  public.admin_ban(text, int, text, boolean), public.admin_unban(text, text),
  public.on_account_delete(), public.run_maintenance()
from public, anon, authenticated;

grant execute on function
  public.player_stats(text), public.top_helpers(int),
  public.feed(bigint, int, text, text, bigint, text, boolean, text[], boolean),
  public.post_comments_list(bigint, bigint, int)
to anon, authenticated;

grant execute on function
  public.delete_post(bigint), public.delete_comment(bigint),
  public.edit_post(bigint, text, text), public.set_best_answer(bigint, bigint),
  public.report_content(bigint, bigint, text, text), public.report_message(bigint, text, text),
  public.admin_open_reports(), public.admin_resolve_report(text, bigint, text),
  public.admin_ban(text, int, text, boolean), public.admin_unban(text, text)
to authenticated;

commit;
