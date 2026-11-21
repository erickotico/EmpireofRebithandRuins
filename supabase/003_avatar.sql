-- =====================================================================
-- Empire of Rebirth & Ruins · v1.2: foto do perfil (brasão)
-- Rodar UMA vez no SQL Editor (depois do 002).
--
-- O jogador escolhe um brasão de reino ou de classe. Só aceita o formato
-- "reino:<id>" ou "classe:<id>" (nada de links ou imagens de fora).
-- =====================================================================

begin;

alter table public.profiles
  add column avatar text
  check (avatar is null or avatar ~ '^(reino|classe):[a-z]{2,20}$');

-- O dono pode mudar a bio e agora também a foto (o apelido continua travado).
grant update (bio, avatar) on public.profiles to authenticated;

commit;
