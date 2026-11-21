-- =====================================================================
-- Empire of Rebirth & Ruins · v1.4: amizades
-- Rodar UMA vez no SQL Editor (depois do 004).
--
-- Pedido de amizade: um envia, o outro aceita ou recusa.
-- O site NÃO mexe na tabela diretamente: tudo passa pelas funções abaixo,
-- que conferem quem está pedindo, aplicam limites contra spam e escondem
-- listas privadas.
--
-- Limites:
--   · 20 pedidos enviados por hora;
--   · 100 pedidos pendentes enviados ao mesmo tempo;
--   · 500 amigos por jogador;
--   · pedido recusado: quem enviou só pode pedir de novo depois de 7 dias.
-- =====================================================================

begin;

-- O jogador escolhe se a lista de amigos aparece para todos.
alter table public.profiles add column friends_public boolean not null default true;
grant update (bio, avatar, shown_badges, friends_public) on public.profiles to authenticated;

create table public.friendships (
  id            bigint generated always as identity primary key,
  requester     uuid not null references auth.users (id) on delete cascade,
  addressee     uuid not null references auth.users (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  check (requester <> addressee)
);
-- Um único registro por dupla, não importa quem pediu
create unique index friendships_pair on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_addressee on public.friendships (addressee, status);
create index friendships_requester on public.friendships (requester, status, created_at desc);

alter table public.friendships enable row level security;
revoke all on public.friendships from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Enviar pedido (pelo apelido)
-- ---------------------------------------------------------------------
create or replace function public.send_friend_request(p_nick text)
returns text   -- 'sent' ou 'accepted' (se o outro já tinha te pedido)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_other  uuid;
  v_row    public.friendships;
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  if public.is_banned() then raise exception 'EOR_BANNED'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;

  select id into v_other from public.profiles where lower(nickname) = lower(btrim(coalesce(p_nick, '')));
  if v_other is null then raise exception 'EOR_NOT_FOUND'; end if;
  if v_other = v_me then raise exception 'EOR_SELF'; end if;

  -- limites contra spam
  if (select count(*) from public.friendships where requester = v_me and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'EOR_TOO_MANY';
  end if;
  if (select count(*) from public.friendships where requester = v_me and status = 'pending') >= 100 then
    raise exception 'EOR_TOO_MANY_PENDING';
  end if;
  if (select count(*) from public.friendships where status = 'accepted' and v_me in (requester, addressee)) >= 500 then
    raise exception 'EOR_FRIEND_LIMIT';
  end if;

  select * into v_row from public.friendships
  where least(requester, addressee) = least(v_me, v_other)
    and greatest(requester, addressee) = greatest(v_me, v_other)
  for update;

  if not found then
    insert into public.friendships (requester, addressee) values (v_me, v_other);
    return 'sent';
  end if;

  if v_row.status = 'accepted' then raise exception 'EOR_ALREADY_FRIENDS'; end if;

  if v_row.status = 'pending' then
    if v_row.requester = v_me then raise exception 'EOR_ALREADY_SENT'; end if;
    -- o outro já tinha pedido: vira amizade
    update public.friendships set status = 'accepted', responded_at = now() where id = v_row.id;
    return 'accepted';
  end if;

  -- recusado antes
  if v_row.requester = v_me and v_row.responded_at > now() - interval '7 days' then
    raise exception 'EOR_COOLDOWN';
  end if;
  update public.friendships
     set requester = v_me, addressee = v_other, status = 'pending', created_at = now(), responded_at = null
   where id = v_row.id;
  return 'sent';
end;
$$;

-- ---------------------------------------------------------------------
-- Responder pedido recebido (aceitar ou recusar)
-- ---------------------------------------------------------------------
create or replace function public.respond_friend_request(p_nick text, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_other  uuid;
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;
  if p_accept and public.is_banned() then raise exception 'EOR_BANNED'; end if;
  select id into v_other from public.profiles where lower(nickname) = lower(btrim(coalesce(p_nick, '')));
  if v_other is null then raise exception 'EOR_NOT_FOUND'; end if;

  if p_accept and (select count(*) from public.friendships where status = 'accepted' and v_me in (requester, addressee)) >= 500 then
    raise exception 'EOR_FRIEND_LIMIT';
  end if;

  update public.friendships
     set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
   where requester = v_other and addressee = v_me and status = 'pending';
  if not found then raise exception 'EOR_NOT_FOUND'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Cancelar pedido enviado ou desfazer amizade
-- ---------------------------------------------------------------------
create or replace function public.remove_friend(p_nick text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_other  uuid;
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;
  select id into v_other from public.profiles where lower(nickname) = lower(btrim(coalesce(p_nick, '')));
  if v_other is null then raise exception 'EOR_NOT_FOUND'; end if;

  delete from public.friendships
   where (status = 'accepted' and v_me in (requester, addressee) and v_other in (requester, addressee))
      or (status = 'pending' and requester = v_me and addressee = v_other);
end;
$$;

-- ---------------------------------------------------------------------
-- Leituras
-- ---------------------------------------------------------------------

-- Situação entre mim e outro jogador (para o botão no perfil dele)
create or replace function public.friendship_status(p_nick text)
returns text   -- none | sent | received | friends
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
             when f.status = 'accepted' then 'friends'
             when f.status = 'pending' and f.requester = (select auth.uid()) then 'sent'
             when f.status = 'pending' then 'received'
             else 'none'
           end
    from public.friendships f
    join public.profiles p on p.id in (f.requester, f.addressee) and p.id <> (select auth.uid())
    where (select auth.uid()) in (f.requester, f.addressee)
      and lower(p.nickname) = lower(btrim(coalesce(p_nick, '')))
  ), 'none');
$$;

-- Meus amigos e pedidos (página Amigos)
create or replace function public.my_friendships()
returns table (nickname text, avatar text, kind text, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.nickname, p.avatar,
         case when f.status = 'accepted' then 'friend'
              when f.requester = (select auth.uid()) then 'sent'
              else 'received' end,
         coalesce(f.responded_at, f.created_at)
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = (select auth.uid()) then f.addressee else f.requester end
  where (select auth.uid()) in (f.requester, f.addressee)
    and (f.status = 'accepted' or f.status = 'pending')
  order by coalesce(f.responded_at, f.created_at) desc;
$$;

-- Quantos pedidos esperando resposta (aviso no topo do site)
create or replace function public.pending_friend_count()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.friendships
  where addressee = (select auth.uid()) and status = 'pending';
$$;

-- Amigos de um jogador (perfil). Lista privada → só o dono vê; os outros recebem a quantidade.
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
  select id, friends_public into v_user, v_public
  from public.profiles where lower(nickname) = lower(btrim(coalesce(p_nick, '')));
  if v_user is null then return; end if;

  select count(*)::int into v_total from public.friendships
  where status = 'accepted' and v_user in (requester, addressee);

  if not v_public and v_user is distinct from (select auth.uid()) then
    return query select null::text, null::text, v_total, true;
    return;
  end if;

  return query
    select p.nickname, p.avatar, v_total, false
    from public.friendships f
    join public.profiles p on p.id = case when f.requester = v_user then f.addressee else f.requester end
    where f.status = 'accepted' and v_user in (f.requester, f.addressee)
    order by f.responded_at desc nulls last
    limit 12;
  if not found then
    return query select null::text, null::text, v_total, false;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function
  public.send_friend_request(text), public.respond_friend_request(text, boolean),
  public.remove_friend(text), public.friendship_status(text), public.my_friendships(),
  public.pending_friend_count(), public.friends_of(text)
  from public, anon, authenticated;

grant execute on function
  public.send_friend_request(text), public.respond_friend_request(text, boolean),
  public.remove_friend(text), public.friendship_status(text), public.my_friendships(),
  public.pending_friend_count()
  to authenticated;

grant execute on function public.friends_of(text) to anon, authenticated;

commit;
