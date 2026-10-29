-- ═══════════════════════════════════════════════════════════════
--  KEHILÁ ANALYTICS — Tablas Supabase
--  Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════

-- ── 1. page_views ────────────────────────────────────────────────
--  Se inserta cada vez que un usuario carga una sección de la app.
--  La columna 'page' tiene el id de la sección: 'noticias', 'eventos', etc.

create table if not exists public.page_views (
  id         uuid default gen_random_uuid() primary key,
  page       text not null,
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc', now())
);

alter table public.page_views enable row level security;

-- Cualquiera puede insertar (el tracking funciona aunque no estés logueado)
create policy "page_views_insert" on public.page_views
  for insert with check (true);

-- Solo usuarios autenticados pueden leer (el admin panel requiere login)
create policy "page_views_select" on public.page_views
  for select using (auth.uid() is not null);

-- Índice para acelerar las consultas agrupadas por sección
create index if not exists idx_page_views_page on public.page_views(page);
create index if not exists idx_page_views_created on public.page_views(created_at);


-- ── 2. news_reads ─────────────────────────────────────────────────
--  Se inserta cada vez que un usuario abre un artículo de noticias.

create table if not exists public.news_reads (
  id         uuid default gen_random_uuid() primary key,
  news_id    text not null,
  user_id    uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc', now())
);

alter table public.news_reads enable row level security;

create policy "news_reads_insert" on public.news_reads
  for insert with check (true);

create policy "news_reads_select" on public.news_reads
  for select using (auth.uid() is not null);

create index if not exists idx_news_reads_news_id on public.news_reads(news_id);
create index if not exists idx_news_reads_created on public.news_reads(created_at);


-- ── 3. Verificación ───────────────────────────────────────────────
--  Ejecuta esto para confirmar que las tablas se crearon bien:

-- select count(*) from public.page_views;
-- select count(*) from public.news_reads;
