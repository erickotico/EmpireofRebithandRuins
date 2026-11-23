-- =====================================================================
-- Empire of Rebirth & Ruins · v1.9: responder comentários + @menções
-- Rodar UMA vez no SQL Editor (depois do 010).
--
--   · Responder: cada comentário pode ter respostas (um nível, como no Facebook).
--     Quem recebeu a resposta ganha um aviso no sino.
--   · @apelido: em publicações e comentários, o jogador marcado recebe um aviso
--     (até 5 por texto; não avisa quem bloqueou/foi bloqueado).
--   · O contador de comentários agora é mantido pelo próprio banco (gatilho).
-- =====================================================================

begin;

alter table public.post_comments
  add column parent_id bigint references public.post_comments (id) on delete cascade;
create index post_comments_parent on public.post_comments (parent_id, id) where parent_id is not null;

alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('like', 'comment', 'best', 'reply', 'mention'));

-- ---------------------------------------------------------------------
-- Contador de comentários pelo banco (inclui respostas apagadas junto)
-- ---------------------------------------------------------------------
create or replace function public.post_comment_count_trg()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts p set comment_count = p.comment_count + 1 where p.id = new.post_id;
  else
    update public.posts p set comment_count = greatest(p.comment_count - 1, 0) where p.id = old.post_id;
  end if;
  return null;
end;
$$;

create trigger post_comments_count
  after insert or delete on public.post_comments
  for each row execute function public.post_comment_count_trg();

-- acerta os números que já existem
update public.posts p set comment_count = (select count(*) from public.post_comments c where c.post_id = p.id);

-- ---------------------------------------------------------------------
-- Avisar quem foi marcado com @apelido
-- ---------------------------------------------------------------------
create or replace function public.notify_mentions(p_actor uuid, p_body text, p_post bigint, p_comment bigint, p_skip uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid;
  v_sent  int := 0;
begin
  for v_user in
    select distinct pr.id
    from regexp_matches(coalesce(p_body, ''), '@([A-Za-z0-9_À-ÖØ-öø-ÿĀ-ž-]{3,20})', 'g') as m (g)
    join public.profiles pr on lower(pr.nickname) = lower(m.g[1])
  loop
    exit when v_sent >= 5;
    continue when v_user = p_actor or v_user = any (coalesce(p_skip, '{}'::uuid[]))
               or public.blocked_between(p_actor, v_user);
    insert into public.notifications (user_id, actor, kind, post_id, comment_id)
    values (v_user, p_actor, 'mention', p_post, p_comment);
    v_sent := v_sent + 1;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Publicar (igual ao 008, agora avisando os @marcados)
-- ---------------------------------------------------------------------
create or replace function public.create_post(p_body text, p_tag text default 'geral', p_image text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := public.assert_can_write();
  v_body  text := btrim(coalesce(p_body, ''));
  v_tag   text := coalesce(nullif(p_tag, ''), 'geral');
  v_id    bigint;
begin
  if v_tag not in ('geral', 'pergunta', 'dica', 'arte', 'anuncio') then raise exception 'EOR_INVALID'; end if;
  if v_tag = 'anuncio' and not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  if char_length(v_body) > 2000 then raise exception 'EOR_TOO_LONG'; end if;
  if char_length(v_body) = 0 and p_image is null then raise exception 'EOR_EMPTY'; end if;

  if p_image is not null then
    if p_image !~ ('^' || v_me::text || '/[0-9a-f-]{36}\.(webp|jpg)$') then raise exception 'EOR_INVALID'; end if;
    if not exists (select 1 from storage.objects o
                   where o.bucket_id = 'post-images' and o.name = p_image and o.owner_id = v_me::text) then
      raise exception 'EOR_INVALID';
    end if;
    if exists (select 1 from public.posts p where p.image_path = p_image) then raise exception 'EOR_INVALID'; end if;
  end if;

  if (select count(*) from public.posts p where p.author = v_me and p.created_at > now() - interval '1 hour') >= 10
     or (select count(*) from public.posts p where p.author = v_me and p.created_at > now() - interval '1 day') >= 40 then
    raise exception 'EOR_TOO_MANY';
  end if;

  insert into public.posts (author, tag, body, image_path)
  values (v_me, v_tag, v_body, p_image)
  returning posts.id into v_id;

  perform public.notify_mentions(v_me, v_body, v_id, null, array[v_me]);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Comentar ou responder (p_parent = comentário respondido)
-- ---------------------------------------------------------------------
drop function public.add_comment(bigint, text);

create function public.add_comment(p_post bigint, p_body text, p_parent bigint default null)
returns table (id bigint, created_at timestamptz, parent_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me             uuid := public.assert_can_write();
  v_author         uuid := public.post_author_visible(p_post);
  v_body           text := btrim(coalesce(p_body, ''));
  v_parent         bigint;
  v_parent_author  uuid;
  v_skip           uuid[];
  v_id             bigint;
  v_at             timestamptz;
begin
  if char_length(v_body) = 0 then raise exception 'EOR_EMPTY'; end if;
  if char_length(v_body) > 1000 then raise exception 'EOR_TOO_LONG'; end if;
  if (select count(*) from public.post_comments c where c.author = v_me and c.created_at > now() - interval '10 minutes') >= 20
     or (select count(*) from public.post_comments c where c.author = v_me and c.created_at > now() - interval '1 hour') >= 100 then
    raise exception 'EOR_TOO_MANY';
  end if;

  if p_parent is not null then
    -- resposta de resposta fica na mesma conversa (um nível só)
    select coalesce(c.parent_id, c.id), c.author into v_parent, v_parent_author
    from public.post_comments c where c.id = p_parent and c.post_id = p_post;
    if v_parent is null then raise exception 'EOR_NOT_FOUND'; end if;
    if public.blocked_between(v_me, v_parent_author) then raise exception 'EOR_BLOCKED'; end if;
  end if;

  insert into public.post_comments as c (post_id, author, body, parent_id)
  values (p_post, v_me, v_body, v_parent)
  returning c.id, c.created_at into v_id, v_at;

  v_skip := array[v_me];
  if p_parent is not null and v_parent_author <> v_me then
    insert into public.notifications (user_id, actor, kind, post_id, comment_id)
    values (v_parent_author, v_me, 'reply', p_post, v_id);
    v_skip := v_skip || v_parent_author;
  end if;
  if not (v_author = any (v_skip)) then
    insert into public.notifications (user_id, actor, kind, post_id, comment_id)
    values (v_author, v_me, 'comment', p_post, v_id);
    v_skip := v_skip || v_author;
  end if;
  perform public.notify_mentions(v_me, v_body, p_post, v_id, v_skip);

  return query select v_id, v_at, v_parent;
end;
$$;

-- ---------------------------------------------------------------------
-- Lista de comentários: página de comentários principais + as respostas deles
-- ---------------------------------------------------------------------
drop function public.post_comments_list(bigint, bigint, int);

create function public.post_comments_list(p_post bigint, p_before bigint default null, p_limit int default 20)
returns table (id bigint, parent_id bigint, nickname text, avatar text, body text, created_at timestamptz, edited_at timestamptz,
               mine boolean, can_delete boolean, is_best boolean, can_mark_best boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_author  uuid := public.post_author_visible(p_post);
  v_admin   boolean := public.is_admin();
  v_best    bigint;
  v_tag     text;
begin
  select p.best_comment, p.tag into v_best, v_tag from public.posts p where p.id = p_post;
  return query
    with top as (
      select c.id as tid
      from public.post_comments c
      where c.post_id = p_post and c.parent_id is null
        and (p_before is null or c.id < p_before)
        and (v_me is null or c.author = v_me or not public.blocked_between(v_me, c.author))
      order by c.id desc
      limit least(greatest(coalesce(p_limit, 20), 1), 50)
    )
    select c.id, c.parent_id, pr.nickname, pr.avatar, c.body, c.created_at, c.edited_at,
           (v_me is not null and c.author = v_me),
           (v_me is not null and (c.author = v_me or v_author = v_me or v_admin)),
           (v_tag = 'pergunta' and c.id = v_best),
           (v_me is not null and v_tag = 'pergunta' and v_author = v_me)
    from public.post_comments c
    join public.profiles pr on pr.id = c.author
    where c.post_id = p_post
      and (c.id in (select tid from top) or c.parent_id in (select tid from top))
      and (v_me is null or c.author = v_me or not public.blocked_between(v_me, c.author))
    order by coalesce(c.parent_id, c.id) desc, c.parent_id nulls first, c.id
    limit 500;
end;
$$;

-- ---------------------------------------------------------------------
-- Apagar comentário (o contador agora é do gatilho)
-- ---------------------------------------------------------------------
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
  if v_comment.id is null then raise exception 'EOR_NOT_FOUND'; end if;
  select p.author into v_owner from public.posts p where p.id = v_comment.post_id;
  if v_comment.author <> v_me and v_owner <> v_me and not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  delete from public.post_comments c where c.id = p_id;
  if public.is_admin() and v_comment.author <> v_me then
    update public.content_reports r set status = 'removed', resolved_by = v_me, resolved_at = now()
    where r.comment_id = p_id and r.status = 'open';
  end if;
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
      delete from public.post_comments c where c.id = v_report.comment_id;
      update public.content_reports r set status = 'removed', resolved_by = v_me, resolved_at = now()
      where r.comment_id = v_report.comment_id and r.status = 'open';
    else
      delete from public.posts p where p.id = v_report.post_id returning p.image_path into v_image;
      update public.content_reports r set status = 'removed', resolved_by = v_me, resolved_at = now()
      where r.post_id = v_report.post_id and r.status = 'open';
    end if;
  end if;
  update public.content_reports r set status = v_status, resolved_by = v_me, resolved_at = now()
  where r.id = p_id and r.status = 'open';
  return v_image;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function
  public.post_comment_count_trg(),
  public.notify_mentions(uuid, text, bigint, bigint, uuid[]),
  public.add_comment(bigint, text, bigint),
  public.post_comments_list(bigint, bigint, int)
from public, anon, authenticated;

grant execute on function public.add_comment(bigint, text, bigint) to authenticated;
grant execute on function public.post_comments_list(bigint, bigint, int) to anon, authenticated;

commit;
