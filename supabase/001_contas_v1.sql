-- =====================================================================
-- Empire of Rebirth & Ruins · v1: contas e perfis de jogador
-- Rodar UMA vez no painel do Supabase: SQL Editor → New query → colar → Run.
-- Este arquivo não tem nenhuma chave nem senha; pode ficar no repositório.
--
-- Camadas de proteção:
--   1. Permissões (GRANT): o site só recebe o mínimo — ler perfis públicos,
--      editar a própria bio e ler os próprios dados privados.
--   2. RLS: mesmo com permissão, cada linha só é visível/alterável por quem pode.
--   3. Validação no servidor: apelido, idade mínima 16 e termos são checados
--      aqui, então burlar o JavaScript do site não adianta.
--   4. Cargo de admin numa tabela que o site NÃO consegue escrever, com
--      registro de auditoria de qualquer mudança.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Regras do apelido (mesmas do site): 3 a 20 caracteres, letras (com
-- acentos latinos), números, _ ou -. Nomes reservados não podem ser usados,
-- para ninguém se passar pela equipe.
-- ---------------------------------------------------------------------
create or replace function public.nickname_ok(p_nick text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_nick is not null
     and p_nick ~ '^[A-Za-z0-9_À-ÖØ-öø-ÿĀ-ž-]{3,20}$'
     and lower(p_nick) not in (
       'admin', 'administrador', 'administrator', 'adm', 'moderador', 'moderator',
       'mod', 'staff', 'suporte', 'support', 'sistema', 'system', 'oficial', 'official',
       'mythforge', 'myth_forge', 'myth-forge', 'mythforgestudios', 'empireofrebirth',
       'empire', 'dev', 'developer', 'desenvolvedor', 'root', 'null', 'undefined'
     );
$$;

-- ---------------------------------------------------------------------
-- 1. Perfil público (qualquer visitante pode ver)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  nickname    text not null check (public.nickname_ok(nickname)),
  bio         text not null default '' check (char_length(bio) <= 280),
  created_at  timestamptz not null default now()
);
-- "Erick" e "erick" contam como o mesmo apelido
create unique index profiles_nickname_unique on public.profiles (lower(nickname));

-- ---------------------------------------------------------------------
-- 2. Dados privados (só o próprio jogador lê; ninguém edita pelo site)
-- ---------------------------------------------------------------------
create table public.profiles_private (
  id                 uuid primary key references auth.users (id) on delete cascade,
  birth_date         date not null,
  terms_version      text not null,
  terms_accepted_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Cargos (admin). O site não tem NENHUMA permissão nesta tabela.
--    Só dá para mudar pelo SQL Editor do painel (com a sua conta + 2FA).
-- ---------------------------------------------------------------------
create table public.user_roles (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('admin')),
  granted_at  timestamptz not null default now()
);

-- Registro de toda mudança de cargo: quem, quando, de onde.
create table public.role_audit (
  id          bigint generated always as identity primary key,
  user_id     uuid not null,
  action      text not null,
  old_role    text,
  new_role    text,
  changed_by  uuid,                                  -- conta do site (se houver)
  db_user     text not null default current_user,    -- usuário do banco que fez
  changed_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Banimentos (para o fórum). Também sem permissão nenhuma pelo site.
-- ---------------------------------------------------------------------
create table public.bans (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  reason        text not null,
  banned_until  timestamptz,                          -- vazio = permanente
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------

-- Admin de verdade = está na tabela de cargos E entrou com o 2º fator (aal2).
-- Senha roubada sozinha não basta.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.user_roles
           where user_id = (select auth.uid()) and role = 'admin'
         )
     and coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2';
$$;

-- O jogador logado está banido?
create or replace function public.is_banned()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bans
    where user_id = (select auth.uid())
      and (banned_until is null or banned_until > now())
  );
$$;

-- Usado pelo formulário de cadastro para avisar "apelido já em uso".
create or replace function public.nickname_available(p_nick text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.nickname_ok(btrim(p_nick))
     and not exists (
       select 1 from public.profiles where lower(nickname) = lower(btrim(p_nick))
     );
$$;

-- Cria o perfil quando alguém se cadastra. Se algo estiver errado
-- (menor de 16, apelido inválido/em uso, sem aceite dos termos),
-- o cadastro inteiro é recusado.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nick   text := btrim(coalesce(new.raw_user_meta_data ->> 'nickname', ''));
  v_terms  text := btrim(coalesce(new.raw_user_meta_data ->> 'terms_version', ''));
  v_birth  date;
begin
  begin
    v_birth := (new.raw_user_meta_data ->> 'birth_date')::date;
  exception when others then
    raise exception 'EOR_BIRTH_INVALID';
  end;

  if v_birth is null or v_birth < date '1900-01-01' then
    raise exception 'EOR_BIRTH_INVALID';
  end if;
  if v_birth > (current_date - interval '16 years')::date then
    raise exception 'EOR_UNDERAGE';
  end if;
  if not public.nickname_ok(v_nick) then
    raise exception 'EOR_NICK_INVALID';
  end if;
  if exists (select 1 from public.profiles where lower(nickname) = lower(v_nick)) then
    raise exception 'EOR_NICK_TAKEN';
  end if;
  if v_terms = '' then
    raise exception 'EOR_TERMS';
  end if;

  insert into public.profiles (id, nickname) values (new.id, v_nick);
  insert into public.profiles_private (id, birth_date, terms_version)
  values (new.id, v_birth, v_terms);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Grava no registro de auditoria toda mudança na tabela de cargos.
create or replace function public.log_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.role_audit (user_id, action, old_role, new_role, changed_by)
  values (
    coalesce(new.user_id, old.user_id),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then old.role end,
    case when tg_op in ('INSERT', 'UPDATE') then new.role end,
    (select auth.uid())
  );
  return coalesce(new, old);
end;
$$;

create trigger user_roles_audit
  after insert or update or delete on public.user_roles
  for each row execute function public.log_role_change();

-- O registro de auditoria não pode ser apagado nem alterado, nem pelo dono.
create or replace function public.block_audit_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'role_audit é somente leitura';
end;
$$;

create trigger role_audit_readonly
  before update or delete on public.role_audit
  for each row execute function public.block_audit_change();

-- ---------------------------------------------------------------------
-- Permissões: tira tudo e devolve só o necessário
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.profiles_private  enable row level security;
alter table public.user_roles        enable row level security;
alter table public.role_audit        enable row level security;
alter table public.bans              enable row level security;

revoke all on public.profiles, public.profiles_private, public.user_roles,
              public.role_audit, public.bans
  from public, anon, authenticated;

-- Perfis: todos leem; o dono só pode mudar a bio (o apelido não muda pelo site).
grant select on public.profiles to anon, authenticated;
grant update (bio) on public.profiles to authenticated;

create policy "perfis visiveis para todos"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "dono edita a propria bio"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()) and not public.is_banned())
  with check (id = (select auth.uid()));

-- Dados privados: só o próprio jogador lê.
grant select on public.profiles_private to authenticated;

create policy "dono le os proprios dados privados"
  on public.profiles_private for select
  to authenticated
  using (id = (select auth.uid()));

-- user_roles, role_audit e bans: nenhuma permissão e nenhuma política
-- para o site. RLS ligado sem política = tudo bloqueado.

-- Funções: ninguém chama nada por padrão; libera só as necessárias.
revoke execute on function
  public.nickname_ok(text), public.is_admin(), public.is_banned(),
  public.nickname_available(text), public.handle_new_user(),
  public.log_role_change(), public.block_audit_change()
  from public, anon, authenticated;

grant execute on function public.nickname_ok(text)        to anon, authenticated;
grant execute on function public.nickname_available(text) to anon, authenticated;
grant execute on function public.is_banned()              to authenticated;
grant execute on function public.is_admin()               to authenticated;

commit;
