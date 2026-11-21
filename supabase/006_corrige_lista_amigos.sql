-- =====================================================================
-- Empire of Rebirth & Ruins · correção da lista de amigos (depois do 005)
-- Rodar UMA vez no SQL Editor.
--
-- A função friends_of usava "nickname" tanto como nome do resultado quanto
-- como coluna da tabela, e o banco não sabia qual era qual
-- ("column reference nickname is ambiguous"). Agora toda coluna tem o nome
-- da tabela na frente. As permissões continuam as mesmas.
-- =====================================================================

create or replace function public.friends_of(p_nick text)
returns table (nickname text, avatar text, total int, is_private boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user    uuid;
  v_public  boolean;
  v_total   int;
begin
  select pr.id, pr.friends_public into v_user, v_public
  from public.profiles pr
  where lower(pr.nickname) = lower(btrim(coalesce(p_nick, '')));
  if v_user is null then return; end if;

  select count(*)::int into v_total
  from public.friendships fr
  where fr.status = 'accepted' and v_user in (fr.requester, fr.addressee);

  if not v_public and v_user is distinct from (select auth.uid()) then
    return query select null::text, null::text, v_total, true;
    return;
  end if;

  return query
    select pf.nickname, pf.avatar, v_total, false
    from public.friendships fr
    join public.profiles pf on pf.id = case when fr.requester = v_user then fr.addressee else fr.requester end
    where fr.status = 'accepted' and v_user in (fr.requester, fr.addressee)
    order by fr.responded_at desc nulls last
    limit 12;
  if not found then
    return query select null::text, null::text, v_total, false;
  end if;
end;
$$;
