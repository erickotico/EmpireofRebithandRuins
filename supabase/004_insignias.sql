-- =====================================================================
-- Empire of Rebirth & Ruins · v1.3: insígnias em destaque
-- Rodar UMA vez no SQL Editor (depois do 003).
--
-- O jogador escolhe até 5 insígnias para mostrar no perfil. Aqui fica só a
-- ESCOLHA (os ids). O site mostra apenas as que o jogador realmente conquistou,
-- então escolher uma insígnia que não tem não faz ela aparecer.
-- =====================================================================

begin;

alter table public.profiles
  add column shown_badges text[]
  check (
    shown_badges is null
    or (
      cardinality(shown_badges) <= 5
      and array_to_string(shown_badges, ',') ~ '^([a-z_]{2,30}(,[a-z_]{2,30})*)?$'
    )
  );

-- O dono pode mudar bio, foto e insígnias em destaque (o apelido continua travado).
grant update (bio, avatar, shown_badges) on public.profiles to authenticated;

commit;
