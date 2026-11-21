-- =====================================================================
-- Empire of Rebirth & Ruins · v1.6: Comunidade (rede social do site)
-- Rodar UMA vez no SQL Editor (depois do 007).
--
-- O que tem:
--   · publicações com texto e/ou imagem (legenda), etiqueta (Geral, Pergunta, Dica, Arte, Anúncio);
--   · curtir, comentar, editar e apagar o que é seu, denunciar o dos outros;
--   · Anúncios: só admin publica; admin pode fixar no topo;
--   · notificações (curtidas e comentários nas suas publicações) para o sino;
--   · painel de denúncias (mensagens + publicações + comentários) só para admin com 2FA.
--
-- Segurança (tudo conferido aqui no banco, não no site):
--   · o site não lê nem escreve as tabelas direto: só pelas funções abaixo;
--   · qualquer pessoa (até sem conta) LÊ o feed; escrever exige conta, não estar banido e 2FA (se ativou);
--   · bloqueio esconde as publicações e comentários entre os dois e impede interação;
--   · imagens: só a própria pasta, só webp/jpeg, até 1,5 MB, 20 por dia;
--   · limites: 10 publicações/hora e 40/dia; 20 comentários a cada 10 min e 100/hora;
--     300 curtidas/hora; 30 denúncias/dia.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table public.posts (
  id             bigint generated always as identity primary key,
  author         uuid not null references auth.users (id) on delete cascade,
  tag            text not null default 'geral' check (tag in ('geral', 'pergunta', 'dica', 'arte', 'anuncio')),
  body           text not null default '' check (char_length(body) <= 2000),
  image_path     text check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg)$'),
  pinned         boolean not null default false,
  like_count     int not null default 0,
  comment_count  int not null default 0,
  created_at     timestamptz not null default now(),
  edited_at      timestamptz,
  check (char_length(btrim(body)) > 0 or image_path is not null)
);
create index posts_recent on public.posts (id desc);
create index posts_author on public.posts (author, id desc);
create index posts_tag on public.posts (tag, id desc);
create index posts_pinned on public.posts (id desc) where pinned;
create index posts_author_time on public.posts (author, created_at desc);

create table public.post_likes (
  post_id     bigint not null references public.posts (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_likes_user_time on public.post_likes (user_id, created_at desc);

create table public.post_comments (
  id          bigint generated always as identity primary key,
  post_id     bigint not null references public.posts (id) on delete cascade,
  author      uuid not null references auth.users (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz
);
create index post_comments_post on public.post_comments (post_id, id desc);
create index post_comments_author_time on public.post_comments (author, created_at desc);

create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,   -- quem recebe
  actor       uuid not null references auth.users (id) on delete cascade,   -- quem fez
  kind        text not null check (kind in ('like', 'comment')),
  post_id     bigint not null references public.posts (id) on delete cascade,
  comment_id  bigint references public.post_comments (id) on delete cascade,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index notifications_user on public.notifications (user_id, id desc);
create index notifications_unread on public.notifications (user_id) where read_at is null;
create unique index notifications_one_like on public.notifications (user_id, actor, post_id) where kind = 'like';

create table public.content_reports (
  id           bigint generated always as identity primary key,
  reporter     uuid not null references auth.users (id) on delete cascade,
  reported     uuid references auth.users (id) on delete set null,
  post_id      bigint,                    -- sem ligação: o conteúdo pode ser apagado, a cópia fica
  comment_id   bigint,
  body_copy    text not null default '',
  image_copy   text,
  reason       text not null default '' check (char_length(reason) <= 300),
  status       text not null default 'open' check (status in ('open', 'removed', 'dismissed')),
  resolved_by  uuid references auth.users (id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  check (post_id is not null or comment_id is not null)
);
create unique index content_reports_once_post on public.content_reports (reporter, post_id) where comment_id is null;
create unique index content_reports_once_comment on public.content_reports (reporter, comment_id) where comment_id is not null;
create index content_reports_open on public.content_reports (created_at) where status = 'open';
create index content_reports_reporter_time on public.content_reports (reporter, created_at desc);

-- Denúncias de mensagens ganham "situação" para o painel
alter table public.message_reports
  add column status text not null default 'open' check (status in ('open', 'removed', 'dismissed')),
  add column resolved_by uuid references auth.users (id) on delete set null,
  add column resolved_at timestamptz;

alter table public.posts           enable row level security;
alter table public.post_likes      enable row level security;
alter table public.post_comments   enable row level security;
alter table public.notifications   enable row level security;
alter table public.content_reports enable row level security;
revoke all on public.posts, public.post_likes, public.post_comments, public.notifications, public.content_reports
  from public, anon, authenticated;
-- Nenhuma política = ninguém acessa as tabelas direto pelo site; só pelas funções.

-- ---------------------------------------------------------------------
-- Imagens (Supabase Storage): pasta pública para ver, envio só na própria pasta
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', true, 1572864, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = true, file_size_limit = 1572864, allowed_mime_types = array['image/webp', 'image/jpeg'];

create or replace function public.can_upload_post_image()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
     and not public.is_banned()
     and public.mfa_satisfied()
     and (select count(*) from storage.objects o
          where o.bucket_id = 'post-images'
            and o.owner_id = (select auth.uid())::text
            and o.created_at > now() - interval '1 day') < 20;
$$;

create policy "envia imagem so na propria pasta"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_upload_post_image()
  );
create policy "ve as proprias imagens (para apagar)"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'post-images' and (owner_id = (select auth.uid())::text or public.is_admin()));
create policy "apaga as proprias imagens"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'post-images' and (owner_id = (select auth.uid())::text or public.is_admin()));

-- ---------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------
-- Pode escrever? (conta, não banido, 2FA ok)
create or replace function public.assert_can_write()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  if public.is_banned() then raise exception 'EOR_BANNED'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;
  return v_me;
end;
$$;

-- A publicação existe e quem está logado pode vê-la (sem bloqueio entre os dois)?
create or replace function public.post_author_visible(p_post bigint)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_author  uuid;
begin
  select p.author into v_author from public.posts p where p.id = p_post;
  if v_author is null then raise exception 'EOR_NOT_FOUND'; end if;
  if v_me is not null and v_me <> v_author and public.blocked_between(v_me, v_author) then
    raise exception 'EOR_BLOCKED';
  end if;
  return v_author;
end;
$$;

-- ---------------------------------------------------------------------
-- Ler o feed
--   p_post   = uma publicação só (link direto)
--   p_author = só as de um jogador (perfil)
--   p_tag    = filtro de etiqueta
--   p_before = paginação (id da última publicação NÃO fixada já mostrada)
-- No feed geral, a 1ª página traz as fixadas primeiro.
-- ---------------------------------------------------------------------
create or replace function public.feed(
  p_before bigint default null, p_limit int default 20,
  p_tag text default null, p_author_nick text default null, p_post bigint default null)
returns table (
  id bigint, nickname text, avatar text, tag text, body text, image_path text, pinned boolean,
  like_count int, comment_count int, created_at timestamptz, edited_at timestamptz,
  liked boolean, mine boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_author  uuid;
  v_general boolean := p_author_nick is null and p_post is null;
begin
  if p_author_nick is not null then
    v_author := public.user_by_nick(p_author_nick);
    if v_author is null then return; end if;
  end if;

  return query
    select p.id, pr.nickname, pr.avatar, p.tag, p.body, p.image_path, p.pinned,
           p.like_count, p.comment_count, p.created_at, p.edited_at,
           (v_me is not null and exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = v_me)),
           (v_me is not null and p.author = v_me)
    from public.posts p
    join public.profiles pr on pr.id = p.author
    where (p_post is null or p.id = p_post)
      and (v_author is null or p.author = v_author)
      and (p_tag is null or p.tag = p_tag)
      and (v_me is null or p.author = v_me or not public.blocked_between(v_me, p.author))
      and (p_before is null or p.id < p_before)
      and (not v_general or p_before is null or not p.pinned)
    order by (v_general and p.pinned) desc, p.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

-- ---------------------------------------------------------------------
-- Publicar / editar / apagar / fixar
-- ---------------------------------------------------------------------
create or replace function public.create_post(p_body text, p_tag text default 'geral', p_image text default null)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := public.assert_can_write();
  v_body  text := btrim(coalesce(p_body, ''));
  v_tag   text := coalesce(nullif(p_tag, ''), 'geral');
  v_id    bigint;
begin
  if v_tag not in ('geral', 'pergunta', 'dica', 'arte', 'anuncio') then raise exception 'EOR_INVALID'; end if;
  if v_tag = 'anuncio' and not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  if char_length(v_body) > 2000 then raise exception 'EOR_TOO_LONG'; end if;
  if char_length(v_body) = 0 and p_image is null then raise exception 'EOR_EMPTY'; end if;

  if p_image is not null then
    if p_image !~ ('^' || v_me::text || '/[0-9a-f-]{36}\.(webp|jpg)$') then raise exception 'EOR_INVALID'; end if;
    if not exists (select 1 from storage.objects o
                   where o.bucket_id = 'post-images' and o.name = p_image and o.owner_id = v_me::text) then
      raise exception 'EOR_INVALID';
    end if;
    if exists (select 1 from public.posts p where p.image_path = p_image) then raise exception 'EOR_INVALID'; end if;
  end if;

  if (select count(*) from public.posts p where p.author = v_me and p.created_at > now() - interval '1 hour') >= 10
     or (select count(*) from public.posts p where p.author = v_me and p.created_at > now() - interval '1 day') >= 40 then
    raise exception 'EOR_TOO_MANY';
  end if;

  insert into public.posts (author, tag, body, image_path)
  values (v_me, v_tag, v_body, p_image)
  returning posts.id into v_id;
  return v_id;
end;
$$;

create or replace function public.edit_post(p_id bigint, p_body text, p_tag text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := public.assert_can_write();
  v_post  public.posts;
  v_body  text := btrim(coalesce(p_body, ''));
  v_tag   text;
begin
  select * into v_post from public.posts p where p.id = p_id;
  if v_post.id is null or v_post.author <> v_me then raise exception 'EOR_NOT_FOUND'; end if;
  v_tag := coalesce(nullif(p_tag, ''), v_post.tag);
  if v_tag not in ('geral', 'pergunta', 'dica', 'arte', 'anuncio') then raise exception 'EOR_INVALID'; end if;
  if v_tag = 'anuncio' and v_post.tag <> 'anuncio' and not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  if char_length(v_body) > 2000 then raise exception 'EOR_TOO_LONG'; end if;
  if char_length(v_body) = 0 and v_post.image_path is null then raise exception 'EOR_EMPTY'; end if;
  update public.posts p set body = v_body, tag = v_tag, edited_at = now() where p.id = p_id;
end;
$$;

-- Apaga (autor ou admin). Devolve o caminho da imagem para o site apagar o arquivo.
create or replace function public.delete_post(p_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := (select auth.uid());
  v_post  public.posts;
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;
  select * into v_post from public.posts p where p.id = p_id;
  if v_post.id is null then raise exception 'EOR_NOT_FOUND'; end if;
  if v_post.author <> v_me and not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  delete from public.posts p where p.id = p_id;
  if v_post.author <> v_me then
    update public.content_reports r set status = 'removed', resolved_by = v_me, resolved_at = now()
    where r.post_id = p_id and r.status = 'open';
  end if;
  return v_post.image_path;
end;
$$;

create or replace function public.set_post_pinned(p_id bigint, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  update public.posts p set pinned = coalesce(p_pinned, false) where p.id = p_id;
  if not found then raise exception 'EOR_NOT_FOUND'; end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Curtir (liga/desliga)
-- ---------------------------------------------------------------------
create or replace function public.toggle_like(p_id bigint)
returns table (liked boolean, like_count int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me      uuid := public.assert_can_write();
  v_author  uuid := public.post_author_visible(p_id);
  v_count   int;
begin
  if exists (select 1 from public.post_likes l where l.post_id = p_id and l.user_id = v_me) then
    delete from public.post_likes l where l.post_id = p_id and l.user_id = v_me;
    update public.posts p set like_count = greatest(p.like_count - 1, 0) where p.id = p_id returning p.like_count into v_count;
    delete from public.notifications n
    where n.kind = 'like' and n.post_id = p_id and n.actor = v_me and n.read_at is null;
    return query select false, v_count;
  else
    if (select count(*) from public.post_likes l where l.user_id = v_me and l.created_at > now() - interval '1 hour') >= 300 then
      raise exception 'EOR_TOO_MANY';
    end if;
    insert into public.post_likes (post_id, user_id) values (p_id, v_me);
    update public.posts p set like_count = p.like_count + 1 where p.id = p_id returning p.like_count into v_count;
    if v_author <> v_me then
      insert into public.notifications (user_id, actor, kind, post_id)
      values (v_author, v_me, 'like', p_id)
      on conflict (user_id, actor, post_id) where kind = 'like' do nothing;
    end if;
    return query select true, v_count;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Comentários
-- ---------------------------------------------------------------------
create or replace function public.post_comments_list(p_post bigint, p_before bigint default null, p_limit int default 20)
returns table (id bigint, nickname text, avatar text, body text, created_at timestamptz, edited_at timestamptz,
               mine boolean, can_delete boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_author  uuid := public.post_author_visible(p_post);
  v_admin   boolean := public.is_admin();
begin
  return query
    select c.id, pr.nickname, pr.avatar, c.body, c.created_at, c.edited_at,
           (v_me is not null and c.author = v_me),
           (v_me is not null and (c.author = v_me or v_author = v_me or v_admin))
    from public.post_comments c
    join public.profiles pr on pr.id = c.author
    where c.post_id = p_post
      and (p_before is null or c.id < p_before)
      and (v_me is null or c.author = v_me or not public.blocked_between(v_me, c.author))
    order by c.id desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50);
end;
$$;

create or replace function public.add_comment(p_post bigint, p_body text)
returns table (id bigint, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me      uuid := public.assert_can_write();
  v_author  uuid := public.post_author_visible(p_post);
  v_body    text := btrim(coalesce(p_body, ''));
  v_id      bigint;
  v_at      timestamptz;
begin
  if char_length(v_body) = 0 then raise exception 'EOR_EMPTY'; end if;
  if char_length(v_body) > 1000 then raise exception 'EOR_TOO_LONG'; end if;
  if (select count(*) from public.post_comments c where c.author = v_me and c.created_at > now() - interval '10 minutes') >= 20
     or (select count(*) from public.post_comments c where c.author = v_me and c.created_at > now() - interval '1 hour') >= 100 then
    raise exception 'EOR_TOO_MANY';
  end if;

  insert into public.post_comments as c (post_id, author, body)
  values (p_post, v_me, v_body)
  returning c.id, c.created_at into v_id, v_at;
  update public.posts p set comment_count = p.comment_count + 1 where p.id = p_post;
  if v_author <> v_me then
    insert into public.notifications (user_id, actor, kind, post_id, comment_id)
    values (v_author, v_me, 'comment', p_post, v_id);
  end if;
  return query select v_id, v_at;
end;
$$;

create or replace function public.edit_comment(p_id bigint, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := public.assert_can_write();
  v_body  text := btrim(coalesce(p_body, ''));
begin
  if char_length(v_body) = 0 then raise exception 'EOR_EMPTY'; end if;
  if char_length(v_body) > 1000 then raise exception 'EOR_TOO_LONG'; end if;
  update public.post_comments c set body = v_body, edited_at = now() where c.id = p_id and c.author = v_me;
  if not found then raise exception 'EOR_NOT_FOUND'; end if;
end;
$$;

-- Apaga: autor do comentário, dono da publicação ou admin
create or replace function public.delete_comment(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me       uuid := (select auth.uid());
  v_comment  public.post_comments;
  v_owner    uuid;
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  if not public.mfa_satisfied() then raise exception 'EOR_MFA'; end if;
  select * into v_comment from public.post_comments c where c.id = p_id;
  if v_comment.id is null then raise exception 'EOR_NOT_FOUND'; end if;
  select p.author into v_owner from public.posts p where p.id = v_comment.post_id;
  if v_comment.author <> v_me and v_owner <> v_me and not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  delete from public.post_comments c where c.id = p_id;
  update public.posts p set comment_count = greatest(p.comment_count - 1, 0) where p.id = v_comment.post_id;
  if public.is_admin() and v_comment.author <> v_me then
    update public.content_reports r set status = 'removed', resolved_by = v_me, resolved_at = now()
    where r.comment_id = p_id and r.status = 'open';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Denunciar publicação ou comentário
-- ---------------------------------------------------------------------
create or replace function public.report_content(p_post bigint default null, p_comment bigint default null, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me      uuid := public.assert_can_write();
  v_author  uuid;
  v_body    text;
  v_image   text;
  v_post    bigint := p_post;
begin
  if (p_post is null) = (p_comment is null) then raise exception 'EOR_INVALID'; end if;
  if (select count(*) from public.content_reports r where r.reporter = v_me and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'EOR_TOO_MANY';
  end if;
  if p_comment is not null then
    select c.author, c.body, c.post_id into v_author, v_body, v_post from public.post_comments c where c.id = p_comment;
  else
    select p.author, p.body, p.image_path into v_author, v_body, v_image from public.posts p where p.id = p_post;
  end if;
  if v_author is null or v_author = v_me then raise exception 'EOR_NOT_FOUND'; end if;

  insert into public.content_reports (reporter, reported, post_id, comment_id, body_copy, image_copy, reason)
  values (v_me, v_author, v_post, p_comment, coalesce(v_body, ''), v_image, left(btrim(coalesce(p_reason, '')), 300))
  on conflict do nothing;
end;
$$;

-- ---------------------------------------------------------------------
-- Notificações (sino)
-- ---------------------------------------------------------------------
create or replace function public.my_notifications(p_limit int default 20)
returns table (id bigint, kind text, nickname text, avatar text, post_id bigint, snippet text,
               created_at timestamptz, unread boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.kind, pr.nickname, pr.avatar, n.post_id,
         left(coalesce(c.body, p.body), 90),
         n.created_at, n.read_at is null
  from public.notifications n
  join public.profiles pr on pr.id = n.actor
  join public.posts p on p.id = n.post_id
  left join public.post_comments c on c.id = n.comment_id
  where n.user_id = (select auth.uid())
    and public.mfa_satisfied()
    and not public.blocked_between(n.user_id, n.actor)
  order by n.id desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public.unread_notification_count()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.notifications n
  where n.user_id = (select auth.uid()) and n.read_at is null;
$$;

create or replace function public.mark_notifications_read()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'EOR_AUTH'; end if;
  update public.notifications n set read_at = now() where n.user_id = v_me and n.read_at is null;
  -- faxina: notificações lidas com mais de 90 dias
  delete from public.notifications n
  where n.id in (select n2.id from public.notifications n2
                 where n2.user_id = v_me and n2.read_at is not null and n2.created_at < now() - interval '90 days'
                 limit 200);
end;
$$;

-- ---------------------------------------------------------------------
-- Painel de denúncias (só admin com 2FA: is_admin() exige aal2)
-- ---------------------------------------------------------------------
create or replace function public.admin_open_reports()
returns table (source text, id bigint, reporter text, reported text, body text, image_path text,
               reason text, created_at timestamptz, post_id bigint, still_exists boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  return query
    select 'message'::text, r.id, rp.nickname, rd.nickname, r.body_copy, null::text, r.reason, r.created_at,
           null::bigint, exists (select 1 from public.messages m where m.id = r.message_id)
    from public.message_reports r
    left join public.profiles rp on rp.id = r.reporter
    left join public.profiles rd on rd.id = r.reported
    where r.status = 'open'
    union all
    select case when r.comment_id is null then 'post' else 'comment' end, r.id, rp.nickname, rd.nickname,
           r.body_copy, r.image_copy, r.reason, r.created_at, r.post_id,
           case when r.comment_id is null
                then exists (select 1 from public.posts p where p.id = r.post_id)
                else exists (select 1 from public.post_comments c where c.id = r.comment_id) end
    from public.content_reports r
    left join public.profiles rp on rp.id = r.reporter
    left join public.profiles rd on rd.id = r.reported
    where r.status = 'open'
    order by 8
    limit 200;
end;
$$;

create or replace function public.admin_open_report_count()
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then return 0; end if;
  return (select count(*) from public.message_reports r where r.status = 'open')
       + (select count(*) from public.content_reports r where r.status = 'open');
end;
$$;

-- p_action: 'dismiss' (descartar) ou 'remove' (apagar o conteúdo denunciado).
-- Mensagens privadas não são apagadas pelo painel: 'remove' só marca como resolvida.
-- Devolve o caminho da imagem apagada (se houver) para o site remover o arquivo.
create or replace function public.admin_resolve_report(p_source text, p_id bigint, p_action text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me      uuid := (select auth.uid());
  v_status  text;
  v_report  public.content_reports;
  v_image   text;
begin
  if not public.is_admin() then raise exception 'EOR_FORBIDDEN'; end if;
  if p_action not in ('dismiss', 'remove') then raise exception 'EOR_INVALID'; end if;
  v_status := case when p_action = 'remove' then 'removed' else 'dismissed' end;

  if p_source = 'message' then
    update public.message_reports r set status = v_status, resolved_by = v_me, resolved_at = now()
    where r.id = p_id and r.status = 'open';
    return null;
  end if;

  select * into v_report from public.content_reports r where r.id = p_id;
  if v_report.id is null then raise exception 'EOR_NOT_FOUND'; end if;

  if p_action = 'remove' then
    if v_report.comment_id is not null then
      update public.posts p set comment_count = greatest(p.comment_count - 1, 0)
      where p.id = (select c.post_id from public.post_comments c where c.id = v_report.comment_id);
      delete from public.post_comments c where c.id = v_report.comment_id;
      update public.content_reports r set status = 'removed', resolved_by = v_me, resolved_at = now()
      where r.comment_id = v_report.comment_id and r.status = 'open';
    else
      delete from public.posts p where p.id = v_report.post_id returning p.image_path into v_image;
      update public.content_reports r set status = 'removed', resolved_by = v_me, resolved_at = now()
      where r.post_id = v_report.post_id and r.status = 'open';
    end if;
  end if;
  update public.content_reports r set status = v_status, resolved_by = v_me, resolved_at = now()
  where r.id = p_id and r.status = 'open';
  return v_image;
end;
$$;

-- ---------------------------------------------------------------------
-- Permissões das funções
-- ---------------------------------------------------------------------
revoke execute on function
  public.can_upload_post_image(), public.assert_can_write(), public.post_author_visible(bigint),
  public.feed(bigint, int, text, text, bigint),
  public.create_post(text, text, text), public.edit_post(bigint, text, text), public.delete_post(bigint),
  public.set_post_pinned(bigint, boolean), public.toggle_like(bigint),
  public.post_comments_list(bigint, bigint, int), public.add_comment(bigint, text),
  public.edit_comment(bigint, text), public.delete_comment(bigint),
  public.report_content(bigint, bigint, text),
  public.my_notifications(int), public.unread_notification_count(), public.mark_notifications_read(),
  public.admin_open_reports(), public.admin_open_report_count(), public.admin_resolve_report(text, bigint, text)
from public, anon, authenticated;

-- Ler o feed e os comentários: qualquer pessoa (até sem conta)
grant execute on function public.feed(bigint, int, text, text, bigint), public.post_comments_list(bigint, bigint, int)
  to anon, authenticated;

-- Usado pela regra de envio de imagens
grant execute on function public.can_upload_post_image() to authenticated;

grant execute on function
  public.create_post(text, text, text), public.edit_post(bigint, text, text), public.delete_post(bigint),
  public.set_post_pinned(bigint, boolean), public.toggle_like(bigint),
  public.add_comment(bigint, text), public.edit_comment(bigint, text), public.delete_comment(bigint),
  public.report_content(bigint, bigint, text),
  public.my_notifications(int), public.unread_notification_count(), public.mark_notifications_read(),
  public.admin_open_reports(), public.admin_open_report_count(), public.admin_resolve_report(text, bigint, text)
to authenticated;

commit;
