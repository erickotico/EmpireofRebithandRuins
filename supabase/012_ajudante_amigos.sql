-- =====================================================================
-- Empire of Rebirth & Ruins · v1.10: insígnia de Ajudante + aba Amigos no Social
-- Rodar UMA vez no SQL Editor (depois do 011).
--
--   · player_stats: quantas respostas do jogador foram escolhidas como "melhor resposta"
--     (não conta resposta escolhida na própria pergunta, para ninguém "se dar" insígnia).
--   · feed com p_friends: só publicações dos seus amigos (e as suas).
-- =====================================================================

begin;

create index if not exists posts_best_comment on public.posts (best_comment) where best_comment is not null;

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
        where p.tag = 'pergunta' and c.author = v_user and p.author <> v_user),
      (select count(*)::int from public.posts p where p.author = v_user);
end;
$$;

-- Quadro "Maiores ajudantes" da Taverna (mais respostas escolhidas como melhores)
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
  where p.tag = 'pergunta' and p.author <> c.author
  group by pr.id, pr.nickname, pr.avatar
  order by count(*) desc, pr.nickname
  limit least(greatest(coalesce(p_limit, 5), 1), 10);
$$;

-- ---------------------------------------------------------------------
-- Feed (mesmo do 010 + p_friends)
-- ---------------------------------------------------------------------
drop function public.feed(bigint, int, text, text, bigint, text, boolean, text[]);

create function public.feed(
  p_before bigint default null, p_limit int default 20,
  p_tag text default null, p_author_nick text default null, p_post bigint default null,
  p_query text default null, p_unsolved boolean default false, p_tags text[] default null,
  p_friends boolean default false)
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
  v_friends boolean := coalesce(p_friends, false);
  v_general boolean;
begin
  if v_query is not null and char_length(v_query) < 2 then return; end if;
  if char_length(coalesce(v_query, '')) > 60 then v_query := left(v_query, 60); end if;
  if p_tags is not null and cardinality(p_tags) > 5 then return; end if;
  if v_friends and v_me is null then return; end if;
  v_general := p_author_nick is null and p_post is null and v_query is null
               and not coalesce(p_unsolved, false) and not v_friends;

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
      and (p_tags is null or p.tag = any (p_tags))
      and (not coalesce(p_unsolved, false) or (p.tag = 'pergunta' and p.best_comment is null))
      and (not v_friends or p.author = v_me or public.are_friends(v_me, p.author))
      and (v_query is null or p.body ilike public.like_pattern(v_query) or pr.nickname ilike public.like_pattern(v_query))
      and (v_me is null or p.author = v_me or not public.blocked_between(v_me, p.author))
      and (p_before is null or p.id < p_before)
      and (not v_general or p_before is null or not p.pinned)
    order by (v_general and p.pinned) desc, p.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

revoke execute on function
  public.feed(bigint, int, text, text, bigint, text, boolean, text[], boolean),
  public.player_stats(text), public.top_helpers(int)
from public, anon, authenticated;

grant execute on function
  public.feed(bigint, int, text, text, bigint, text, boolean, text[], boolean),
  public.player_stats(text), public.top_helpers(int)
to anon, authenticated;

commit;
