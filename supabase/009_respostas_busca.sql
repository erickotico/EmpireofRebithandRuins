-- =====================================================================
-- Empire of Rebirth & Ruins · v1.7: melhor resposta + busca
-- Rodar UMA vez no SQL Editor (depois do 008).
--
--   · Pergunta: quem perguntou marca o comentário que resolveu ("melhor resposta");
--     a pergunta ganha o selo "Resolvida" e a resposta aparece em destaque.
--     O autor do comentário escolhido recebe um aviso no sino.
--   · Filtro "Sem solução": perguntas que ainda não têm melhor resposta.
--   · Busca: procura no texto das publicações e nos apelidos dos jogadores.
-- =====================================================================

begin;

-- Busca rápida por pedaços de texto (índice "trigram")
create extension if not exists pg_trgm with schema extensions;

alter table public.posts
  add column best_comment bigint references public.post_comments (id) on delete set null;

create index posts_body_search on public.posts using gin (body extensions.gin_trgm_ops);
create index profiles_nick_search on public.profiles using gin (nickname extensions.gin_trgm_ops);
create index posts_unsolved on public.posts (id desc) where tag = 'pergunta' and best_comment is null;

-- Novo tipo de aviso: "seu comentário foi escolhido como melhor resposta"
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('like', 'comment', 'best'));

-- Texto da busca → padrão seguro para LIKE (% e _ digitados viram texto comum)
create or replace function public.like_pattern(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '%' || replace(replace(replace(btrim(coalesce(p_text, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

-- ---------------------------------------------------------------------
-- Feed (agora com melhor resposta, filtro "sem solução" e busca)
-- ---------------------------------------------------------------------
drop function public.feed(bigint, int, text, text, bigint);

create function public.feed(
  p_before bigint default null, p_limit int default 20,
  p_tag text default null, p_author_nick text default null, p_post bigint default null,
  p_query text default null, p_unsolved boolean default false)
returns table (
  id bigint, nickname text, avatar text, tag text, body text, image_path text, pinned boolean,
  like_count int, comment_count int, created_at timestamptz, edited_at timestamptz,
  liked boolean, mine boolean,
  best_comment bigint, best_nickname text, best_avatar text, best_body text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_author  uuid;
  v_query   text := nullif(btrim(coalesce(p_query, '')), '');
  v_general boolean;
begin
  if v_query is not null and char_length(v_query) < 2 then return; end if;
  if char_length(coalesce(v_query, '')) > 60 then v_query := left(v_query, 60); end if;
  v_general := p_author_nick is null and p_post is null and v_query is null and not coalesce(p_unsolved, false);

  if p_author_nick is not null then
    v_author := public.user_by_nick(p_author_nick);
    if v_author is null then return; end if;
  end if;

  return query
    select p.id, pr.nickname, pr.avatar, p.tag, p.body, p.image_path, p.pinned,
           p.like_count, p.comment_count, p.created_at, p.edited_at,
           (v_me is not null and exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = v_me)),
           (v_me is not null and p.author = v_me),
           bc.id, bpr.nickname, bpr.avatar, bc.body
    from public.posts p
    join public.profiles pr on pr.id = p.author
    left join public.post_comments bc on bc.id = p.best_comment and p.tag = 'pergunta'
    left join public.profiles bpr on bpr.id = bc.author
    where (p_post is null or p.id = p_post)
      and (v_author is null or p.author = v_author)
      and (p_tag is null or p.tag = p_tag)
      and (not coalesce(p_unsolved, false) or (p.tag = 'pergunta' and p.best_comment is null))
      and (v_query is null or p.body ilike public.like_pattern(v_query) or pr.nickname ilike public.like_pattern(v_query))
      and (v_me is null or p.author = v_me or not public.blocked_between(v_me, p.author))
      and (p_before is null or p.id < p_before)
      and (not v_general or p_before is null or not p.pinned)
    order by (v_general and p.pinned) desc, p.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

-- ---------------------------------------------------------------------
-- Comentários (agora dizem qual é a melhor resposta e se você pode marcar)
-- ---------------------------------------------------------------------
drop function public.post_comments_list(bigint, bigint, int);

create function public.post_comments_list(p_post bigint, p_before bigint default null, p_limit int default 20)
returns table (id bigint, nickname text, avatar text, body text, created_at timestamptz, edited_at timestamptz,
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
    select c.id, pr.nickname, pr.avatar, c.body, c.created_at, c.edited_at,
           (v_me is not null and c.author = v_me),
           (v_me is not null and (c.author = v_me or v_author = v_me or v_admin)),
           (v_tag = 'pergunta' and c.id = v_best),
           (v_me is not null and v_tag = 'pergunta' and v_author = v_me)
    from public.post_comments c
    join public.profiles pr on pr.id = c.author
    where c.post_id = p_post
      and (p_before is null or c.id < p_before)
      and (v_me is null or c.author = v_me or not public.blocked_between(v_me, c.author))
    order by c.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

-- ---------------------------------------------------------------------
-- Marcar / desmarcar a melhor resposta (só quem fez a pergunta)
-- p_comment = null → desmarca
-- ---------------------------------------------------------------------
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
  if v_post.id is null or v_post.author <> v_me then raise exception 'EOR_NOT_FOUND'; end if;
  if v_post.tag <> 'pergunta' then raise exception 'EOR_INVALID'; end if;

  if p_comment is null then
    update public.posts p set best_comment = null where p.id = p_post;
    return;
  end if;

  select c.author into v_c_author from public.post_comments c where c.id = p_comment and c.post_id = p_post;
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

-- Mudou a etiqueta de "Pergunta" para outra → a melhor resposta deixa de valer
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
  if v_post.id is null or v_post.author <> v_me then raise exception 'EOR_NOT_FOUND'; end if;
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

-- ---------------------------------------------------------------------
-- Buscar jogadores pelo apelido
-- ---------------------------------------------------------------------
create or replace function public.search_players(p_query text, p_limit int default 8)
returns table (nickname text, avatar text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_query  text := left(btrim(coalesce(p_query, '')), 20);
begin
  if char_length(v_query) < 2 then return; end if;
  return query
    select pr.nickname, pr.avatar
    from public.profiles pr
    where pr.nickname ilike public.like_pattern(v_query)
      and (v_me is null or pr.id = v_me or not public.blocked_between(v_me, pr.id))
    order by (lower(pr.nickname) = lower(v_query)) desc,
             starts_with(lower(pr.nickname), lower(v_query)) desc,
             pr.nickname
    limit least(greatest(coalesce(p_limit, 8), 1), 20);
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function
  public.like_pattern(text),
  public.feed(bigint, int, text, text, bigint, text, boolean),
  public.post_comments_list(bigint, bigint, int),
  public.set_best_answer(bigint, bigint),
  public.search_players(text, int)
from public, anon, authenticated;

grant execute on function
  public.feed(bigint, int, text, text, bigint, text, boolean),
  public.post_comments_list(bigint, bigint, int),
  public.search_players(text, int)
to anon, authenticated;

grant execute on function public.set_best_answer(bigint, bigint) to authenticated;

commit;
