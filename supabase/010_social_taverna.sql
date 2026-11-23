-- =====================================================================
-- Empire of Rebirth & Ruins · v1.8: Social e Taverna separadas
-- Rodar UMA vez no SQL Editor (depois do 009).
--
-- O feed passa a aceitar um GRUPO de etiquetas (p_tags):
--   · Social  → geral, arte, anuncio
--   · Taverna → pergunta, dica
-- Nada muda nas regras de segurança: só leitura, igual antes.
-- =====================================================================

begin;

drop function public.feed(bigint, int, text, text, bigint, text, boolean);

create function public.feed(
  p_before bigint default null, p_limit int default 20,
  p_tag text default null, p_author_nick text default null, p_post bigint default null,
  p_query text default null, p_unsolved boolean default false, p_tags text[] default null)
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
  if p_tags is not null and cardinality(p_tags) > 5 then return; end if;
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
      and (p_tags is null or p.tag = any (p_tags))
      and (not coalesce(p_unsolved, false) or (p.tag = 'pergunta' and p.best_comment is null))
      and (v_query is null or p.body ilike public.like_pattern(v_query) or pr.nickname ilike public.like_pattern(v_query))
      and (v_me is null or p.author = v_me or not public.blocked_between(v_me, p.author))
      and (p_before is null or p.id < p_before)
      and (not v_general or p_before is null or not p.pinned)
    order by (v_general and p.pinned) desc, p.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

revoke execute on function public.feed(bigint, int, text, text, bigint, text, boolean, text[]) from public, anon, authenticated;
grant execute on function public.feed(bigint, int, text, text, bigint, text, boolean, text[]) to anon, authenticated;

commit;
