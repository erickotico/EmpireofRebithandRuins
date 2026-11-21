-- =====================================================================
-- Empire of Rebirth & Ruins · v1.5: mensagens entre amigos, bloqueio e denúncias
-- Rodar UMA vez no SQL Editor (depois do 006).
--
-- Regras (todas conferidas aqui no banco, não no site):
--   · só amigos conversam; bloqueio (em qualquer direção) impede tudo;
--   · cada um só LÊ as próprias conversas; ENVIAR só pela função send_message;
--   · até 1.000 caracteres por mensagem; 20 por minuto e 300 por hora;
--   · mensagens com mais de 1 ano são apagadas automaticamente;
--   · denúncia guarda uma cópia do texto (o admin vê em Table Editor → message_reports).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table public.blocks (
  blocker     uuid not null references auth.users (id) on delete cascade,
  blocked     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index blocks_blocked on public.blocks (blocked);

create table public.messages (
  id          bigint generated always as identity primary key,
  sender      uuid not null references auth.users (id) on delete cascade,
  recipient   uuid not null references auth.users (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  check (sender <> recipient)
);
create index messages_pair on public.messages (least(sender, recipient), greatest(sender, recipient), id desc);
create index messages_unread on public.messages (recipient, read_at) where read_at is null;
create index messages_sender_time on public.messages (sender, created_at desc);
create index messages_created on public.messages (created_at);

create table public.message_reports (
  id            bigint generated always as identity primary key,
  message_id    bigint,                                 -- pode sumir depois (1 ano); a cópia fica
  reporter      uuid not null references auth.users (id) on delete cascade,
  reported      uuid references auth.users (id) on delete set null,
  body_copy     text not null,
  reason        text not null default '' check (char_length(reason) <= 300),
  message_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (message_id, reporter)
);

alter table public.blocks          enable row level security;
alter table public.messages        enable row level security;
alter table public.message_reports enable row level security;
revoke all on public.blocks, public.messages, public.message_reports from public, anon, authenticated;

-- Ler: cada um só vê as mensagens das próprias conversas (necessário para chegar "na hora").
-- Escrever: ninguém pelo site; só a função send_message.
grant select on public.messages to authenticated;
create policy "le so as proprias mensagens"
  on public.messages for select
  to authenticated
  using ((select auth.uid()) in (sender, recipient));
create policy "2fa exigido para ler mensagens"
  on public.messages as restrictive for select
  to authenticated
  using (public.mfa_satisfied());

-- Mensagens chegando na hora (Supabase Realtime)
alter publication supabase_realtime add table public.messages;

-- ---------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------
create or replace function public.user_by_nick(p_nick text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id from public.profiles pr where lower(pr.nickname) = lower(btrim(coalesce(p_nick, '')));
$$;

create or replace function public.blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks bl
    where (bl.blocker = a and bl.blocked = b) or (bl.blocker = b and bl.blocked = a)
  );
$$;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships fr
    where fr.status = 'accepted'
      and least(fr.requester, fr.addressee) = least(a, b)
      and greatest(fr.requester, fr.addressee) = greatest(a, b)
  );
$$;

-- ---------------------------------------------------------------------
-- Enviar mensagem
-- ---------------------------------------------------------------------
create or replace function public.send_message(p_nick text, p_body text)
returns table (id bigint, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := (select auth.uid());
  v_to    uuid;
  v_body  text := btrim(coalesce(p_body, ''));
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  if public.is_banned() then raise exception 'EOR_BANNED'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;
  if char_length(v_body) = 0 then raise exception 'EOR_EMPTY'; end if;
  if char_length(v_body) > 1000 then raise exception 'EOR_TOO_LONG'; end if;

  v_to := public.user_by_nick(p_nick);
  if v_to is null or v_to = v_me then raise exception 'EOR_NOT_FOUND'; end if;
  if public.blocked_between(v_me, v_to) then raise exception 'EOR_BLOCKED'; end if;
  if not public.are_friends(v_me, v_to) then raise exception 'EOR_NOT_FRIENDS'; end if;

  if (select count(*) from public.messages m where m.sender = v_me and m.created_at > now() - interval '1 minute') >= 20
     or (select count(*) from public.messages m where m.sender = v_me and m.created_at > now() - interval '1 hour') >= 300 then
    raise exception 'EOR_TOO_MANY';
  end if;

  -- faxina: apaga mensagens com mais de 1 ano (aos poucos, sem pesar)
  delete from public.messages m
  where m.id in (select m2.id from public.messages m2 where m2.created_at < now() - interval '1 year' limit 200);

  return query
    insert into public.messages as m (sender, recipient, body)
    values (v_me, v_to, v_body)
    returning m.id, m.created_at;
end;
$$;

-- ---------------------------------------------------------------------
-- Ler uma conversa (mais novas primeiro; p_before = paginação)
-- ---------------------------------------------------------------------
create or replace function public.conversation(p_nick text, p_before bigint default null, p_limit int default 50)
returns table (id bigint, mine boolean, body text, created_at timestamptz, read_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me     uuid := (select auth.uid());
  v_other  uuid;
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;
  v_other := public.user_by_nick(p_nick);
  if v_other is null then raise exception 'EOR_NOT_FOUND'; end if;

  return query
    select m.id, m.sender = v_me, m.body, m.created_at, m.read_at
    from public.messages m
    where least(m.sender, m.recipient) = least(v_me, v_other)
      and greatest(m.sender, m.recipient) = greatest(v_me, v_other)
      and (p_before is null or m.id < p_before)
    order by m.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

-- Marcar como lidas as mensagens recebidas de alguém
create or replace function public.mark_conversation_read(p_nick text)
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
  v_other := public.user_by_nick(p_nick);
  if v_other is null then return; end if;
  update public.messages m set read_at = now()
  where m.recipient = v_me and m.sender = v_other and m.read_at is null;
end;
$$;

-- Lista de conversas: última mensagem e quantas não lidas
create or replace function public.my_conversations()
returns table (nickname text, avatar text, last_body text, last_at timestamptz, last_mine boolean, unread int, is_friend boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with mine as (
    select m.*, case when m.sender = (select auth.uid()) then m.recipient else m.sender end as other
    from public.messages m
    where (select auth.uid()) in (m.sender, m.recipient)
      and public.mfa_satisfied()
  ), last as (
    select distinct on (mi.other) mi.other, mi.body, mi.created_at, mi.sender = (select auth.uid()) as was_mine
    from mine mi
    order by mi.other, mi.id desc
  )
  select pr.nickname, pr.avatar, l.body, l.created_at, l.was_mine,
         (select count(*)::int from mine u where u.other = l.other and u.recipient = (select auth.uid()) and u.read_at is null),
         public.are_friends((select auth.uid()), l.other)
  from last l
  join public.profiles pr on pr.id = l.other
  order by l.created_at desc;
$$;

-- Total de mensagens não lidas (envelope no topo do site)
create or replace function public.unread_message_count()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.messages m
  where m.recipient = (select auth.uid()) and m.read_at is null;
$$;

-- ---------------------------------------------------------------------
-- Bloquear / desbloquear
-- ---------------------------------------------------------------------
create or replace function public.block_player(p_nick text)
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
  v_other := public.user_by_nick(p_nick);
  if v_other is null or v_other = v_me then raise exception 'EOR_NOT_FOUND'; end if;
  if (select count(*) from public.blocks bl where bl.blocker = v_me) >= 1000 then raise exception 'EOR_TOO_MANY'; end if;

  insert into public.blocks (blocker, blocked) values (v_me, v_other) on conflict do nothing;
  -- bloquear desfaz a amizade e apaga pedidos entre os dois
  delete from public.friendships fr
  where least(fr.requester, fr.addressee) = least(v_me, v_other)
    and greatest(fr.requester, fr.addressee) = greatest(v_me, v_other);
end;
$$;

create or replace function public.unblock_player(p_nick text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'EOR_AUTH'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;
  delete from public.blocks bl
  where bl.blocker = (select auth.uid()) and bl.blocked = public.user_by_nick(p_nick);
end;
$$;

create or replace function public.my_blocks()
returns table (nickname text, avatar text, since timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.nickname, pr.avatar, bl.created_at
  from public.blocks bl
  join public.profiles pr on pr.id = bl.blocked
  where bl.blocker = (select auth.uid())
  order by bl.created_at desc;
$$;

-- Eu bloqueei essa pessoa? (perfil e chat)
create or replace function public.i_blocked(p_nick text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks bl
    where bl.blocker = (select auth.uid()) and bl.blocked = public.user_by_nick(p_nick)
  );
$$;

-- ---------------------------------------------------------------------
-- Denunciar mensagem recebida
-- ---------------------------------------------------------------------
create or replace function public.report_message(p_id bigint, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me  uuid := (select auth.uid());
  v_m   public.messages;
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;
  select * into v_m from public.messages m where m.id = p_id and m.recipient = v_me;
  if not found then raise exception 'EOR_NOT_FOUND'; end if;
  if (select count(*) from public.message_reports r where r.reporter = v_me and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'EOR_TOO_MANY';
  end if;
  insert into public.message_reports (message_id, reporter, reported, body_copy, reason, message_at)
  values (v_m.id, v_me, v_m.sender, v_m.body, left(btrim(coalesce(p_reason, '')), 300), v_m.created_at)
  on conflict (message_id, reporter) do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- Pedido de amizade agora também respeita o bloqueio
-- (mesma função do 005, com a checagem de bloqueio a mais)
-- ---------------------------------------------------------------------
create or replace function public.send_friend_request(p_nick text)
returns text
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

  v_other := public.user_by_nick(p_nick);
  if v_other is null then raise exception 'EOR_NOT_FOUND'; end if;
  if v_other = v_me then raise exception 'EOR_SELF'; end if;
  if public.blocked_between(v_me, v_other) then raise exception 'EOR_BLOCKED'; end if;

  if (select count(*) from public.friendships fr where fr.requester = v_me and fr.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'EOR_TOO_MANY';
  end if;
  if (select count(*) from public.friendships fr where fr.requester = v_me and fr.status = 'pending') >= 100 then
    raise exception 'EOR_TOO_MANY_PENDING';
  end if;
  if (select count(*) from public.friendships fr where fr.status = 'accepted' and v_me in (fr.requester, fr.addressee)) >= 500 then
    raise exception 'EOR_FRIEND_LIMIT';
  end if;

  select * into v_row from public.friendships fr
  where least(fr.requester, fr.addressee) = least(v_me, v_other)
    and greatest(fr.requester, fr.addressee) = greatest(v_me, v_other)
  for update;

  if not found then
    insert into public.friendships (requester, addressee) values (v_me, v_other);
    return 'sent';
  end if;

  if v_row.status = 'accepted' then raise exception 'EOR_ALREADY_FRIENDS'; end if;

  if v_row.status = 'pending' then
    if v_row.requester = v_me then raise exception 'EOR_ALREADY_SENT'; end if;
    update public.friendships set status = 'accepted', responded_at = now() where friendships.id = v_row.id;
    return 'accepted';
  end if;

  if v_row.requester = v_me and v_row.responded_at > now() - interval '7 days' then
    raise exception 'EOR_COOLDOWN';
  end if;
  update public.friendships
     set requester = v_me, addressee = v_other, status = 'pending', created_at = now(), responded_at = null
   where friendships.id = v_row.id;
  return 'sent';
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on function
  public.user_by_nick(text), public.blocked_between(uuid, uuid), public.are_friends(uuid, uuid),
  public.send_message(text, text), public.conversation(text, bigint, int), public.mark_conversation_read(text),
  public.my_conversations(), public.unread_message_count(), public.block_player(text),
  public.unblock_player(text), public.my_blocks(), public.i_blocked(text), public.report_message(bigint, text)
  from public, anon, authenticated;

grant execute on function
  public.send_message(text, text), public.conversation(text, bigint, int), public.mark_conversation_read(text),
  public.my_conversations(), public.unread_message_count(), public.block_player(text),
  public.unblock_player(text), public.my_blocks(), public.i_blocked(text), public.report_message(bigint, text)
  to authenticated;

commit;
