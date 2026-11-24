-- =====================================================================
-- Empire of Rebirth & Ruins · v1.11: status (online, ocupado, não perturbe, oculto)
-- Rodar UMA vez no SQL Editor (depois do 012).
--
--   · O site avisa o banco a cada ~1 min enquanto a aba está aberta ("estou aqui").
--   · Ativo = apareceu nos últimos 2 minutos.
--   · O jogador escolhe o modo (profiles.presence_mode):
--       auto      → ativo: ONLINE (verde)          · fora: visto por último (cinza)
--       busy      → ativo: OCUPADO (vermelho)      · fora: visto por último (cinza)
--       dnd       → ativo: NÃO PERTURBE (amarelo)  · fora: visto por último (cinza)
--       invisible → sempre OCULTO para os outros: cinza, sem "visto por último"
--   · SÓ AMIGOS veem o status. Ninguém lê as tabelas direto: só pelas funções abaixo.
-- =====================================================================

begin;

alter table public.profiles
  add column presence_mode text not null default 'auto'
  check (presence_mode in ('auto', 'busy', 'dnd', 'invisible'));
grant update (bio, avatar, shown_badges, friends_public, presence_mode) on public.profiles to authenticated;

create table public.presence (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  seen_at  timestamptz not null default now()
);
alter table public.presence enable row level security;
revoke all on public.presence from public, anon, authenticated;

-- "Estou aqui" (no máximo 1 gravação a cada 30 s por jogador)
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
end;
$$;

-- Status que os OUTROS veem: 'online' | 'busy' | 'dnd' | 'offline' (+ visto por último, se puder)
create or replace function public.presence_state(p_mode text, p_seen timestamptz)
returns table (state text, seen_at timestamptz)
language sql
stable
set search_path = ''
as $$
  select
    case
      when p_mode = 'invisible' then 'offline'
      when p_seen is not null and p_seen > now() - interval '2 minutes' then
        case p_mode when 'busy' then 'busy' when 'dnd' then 'dnd' else 'online' end
      else 'offline'
    end,
    case when p_mode = 'invisible' then null else p_seen end;
$$;

-- Status dos seus amigos
create or replace function public.friends_presence()
returns table (nickname text, state text, seen_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.nickname, st.state, st.seen_at
  from public.friendships fr
  join public.profiles pr
    on pr.id = case when fr.requester = (select auth.uid()) then fr.addressee else fr.requester end
  left join public.presence pz on pz.user_id = pr.id
  cross join lateral public.presence_state(pr.presence_mode, pz.seen_at) st
  where fr.status = 'accepted'
    and (select auth.uid()) in (fr.requester, fr.addressee)
    and public.mfa_satisfied()
    and not public.blocked_between((select auth.uid()), pr.id);
$$;

-- Status de um jogador (você mesmo ou um amigo)
create or replace function public.presence_of(p_nick text)
returns table (state text, seen_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me    uuid := (select auth.uid());
  v_user  uuid := public.user_by_nick(p_nick);
begin
  if v_me is null or v_user is null or not public.mfa_satisfied() then return; end if;
  if v_user <> v_me and (not public.are_friends(v_me, v_user) or public.blocked_between(v_me, v_user)) then
    return;
  end if;
  return query
    select st.state, st.seen_at
    from public.profiles pr
    left join public.presence pz on pz.user_id = pr.id
    cross join lateral public.presence_state(pr.presence_mode, pz.seen_at) st
    where pr.id = v_user;
end;
$$;

revoke execute on function public.heartbeat(), public.presence_state(text, timestamptz),
  public.friends_presence(), public.presence_of(text)
  from public, anon, authenticated;
grant execute on function public.heartbeat(), public.friends_presence(), public.presence_of(text)
  to authenticated;

commit;
