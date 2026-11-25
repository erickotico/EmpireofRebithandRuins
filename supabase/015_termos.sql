-- =====================================================================
-- Empire of Rebirth & Ruins · v1.13: Termos de uso + aceite da nova versão
-- Rodar UMA vez no SQL Editor (depois do 014).
--
--   · O banco passa a saber qual é a versão atual dos termos
--     (current_terms_version). Ao mudar os termos de novo, basta trocar
--     a data aqui E em js/auth.js + js/layout.js (TERMS_VERSION).
--   · Quem aceitou uma versão antiga vê um aviso no site e aceita a nova
--     com um clique (accept_terms). O banco grava a versão e a data.
--   · Ninguém escolhe a versão que "aceitou": o banco grava sempre a atual.
-- =====================================================================

begin;

create or replace function public.current_terms_version()
returns text
language sql
immutable
set search_path = ''
as $$ select '2026-11-24'::text $$;

-- true = o jogador logado ainda não aceitou a versão atual
create or replace function public.terms_pending()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select pp.terms_version is distinct from public.current_terms_version()
     from public.profiles_private pp
     where pp.id = (select auth.uid())),
    false);
$$;

create or replace function public.accept_terms()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'EOR_AUTH'; end if;
  update public.profiles_private pp
     set terms_version = public.current_terms_version(),
         terms_accepted_at = now()
   where pp.id = (select auth.uid());
end;
$$;

revoke execute on function public.current_terms_version() from public, anon, authenticated;
revoke execute on function public.terms_pending() from public, anon, authenticated;
revoke execute on function public.accept_terms() from public, anon, authenticated;
grant execute on function public.terms_pending() to authenticated;
grant execute on function public.accept_terms() to authenticated;

commit;
