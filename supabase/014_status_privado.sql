-- =====================================================================
-- Empire of Rebirth & Ruins · v1.12: o status escolhido fica PRIVADO
-- Rodar UMA vez no SQL Editor (depois do 013).
--
--   · Antes: qualquer pessoa conseguia ler a coluna profiles.presence_mode
--     (ex.: ver que alguém escolheu "Oculto" ou "Não perturbe").
--   · Agora: ninguém lê essa coluna direto. Cada jogador lê só o próprio
--     status pela função my_presence_mode(); os amigos continuam vendo
--     só o resultado (online / ocupado / não perturbe / offline) pelas
--     funções do 013.
-- =====================================================================

begin;

-- Leitura do perfil coluna por coluna: tudo menos presence_mode
revoke select on public.profiles from anon, authenticated;
grant select (id, nickname, bio, created_at, avatar, shown_badges, friends_public)
  on public.profiles to anon, authenticated;

-- O próprio status (só de quem está logado)
create or replace function public.my_presence_mode()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pr.presence_mode
  from public.profiles pr
  where pr.id = (select auth.uid());
$$;

revoke execute on function public.my_presence_mode() from public, anon, authenticated;
grant execute on function public.my_presence_mode() to authenticated;

commit;
