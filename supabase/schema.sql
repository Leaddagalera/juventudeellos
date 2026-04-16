-- ============================================================
-- Ellos Juventude — Supabase Schema
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ── PERFIS ──────────────────────────────────────────────────────────────────
create table if not exists public.perfis (
  id               uuid primary key default uuid_generate_v4(),
  nome             text unique not null,
  label            text not null,
  descricao        text,
  protegido        boolean not null default false,
  telas            text[] default '{}',
  acoes            text[] default '{}',
  campos_visiveis  text[] default '{}',
  criado_em        timestamptz not null default now()
);

-- ── USERS ────────────────────────────────────────────────────────────────────
create table if not exists public.users (
  id               uuid primary key references auth.users(id) on delete cascade,
  nome             text not null,
  email            text unique not null,
  whatsapp         text,
  role             text not null default 'membro_observador',
  subdepartamento  text[] default '{}', -- array: membro pode estar em múltiplos subdeps
  instrumento      text[] default '{}', -- array of instruments for louvor
  data_nascimento  date,
  data_entrada     date,
  estado_civil     text,
  endereco         text,
  genero           text check (genero in ('M','F','O')),
  turma_ebd        text,               -- fixed EBD class for teachers
  tarja            text check (tarja in ('discipulo','nicodemos','prodigo') or tarja is null),
  tarja_atualizada_em timestamptz,
  ativo            boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Full-text search index on nome
create index if not exists users_nome_trgm on public.users using gin (nome gin_trgm_ops);

-- ── CICLOS ───────────────────────────────────────────────────────────────────
create table if not exists public.ciclos (
  id       uuid primary key default uuid_generate_v4(),
  inicio   date not null,
  fim      date not null,
  status   text not null default 'briefing_regente'
           check (status in (
             'briefing_regente','briefing_lider','disponibilidade',
             'gerando_escala','escala_publicada','confirmacoes','encerrado'
           )),
  created_at timestamptz not null default now()
);

-- ── BRIEFINGS ────────────────────────────────────────────────────────────────
create table if not exists public.briefings (
  id              uuid primary key default uuid_generate_v4(),
  ciclo_id        uuid not null references public.ciclos(id) on delete cascade,
  subdepartamento text not null check (subdepartamento in ('louvor','regencia','ebd','recepcao','midia')),
  domingo         date not null,
  dados_json      jsonb not null default '{}',
  tipo            text not null default 'regular',
  preenchido_por  uuid references public.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (ciclo_id, subdepartamento, domingo, tipo)
);

-- ── DISPONIBILIDADES ─────────────────────────────────────────────────────────
-- One row per user × ciclo × domingo × subdepartamento
create table if not exists public.disponibilidades (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references public.users(id) on delete cascade,
  ciclo_id        uuid not null references public.ciclos(id) on delete cascade,
  domingo         date not null,
  subdepartamento text not null,
  disponivel      boolean not null,
  created_at      timestamptz not null default now(),
  unique (user_id, ciclo_id, domingo, subdepartamento)
);

create index if not exists disp_ciclo_domingo on public.disponibilidades (ciclo_id, domingo);

-- ── ESCALAS ──────────────────────────────────────────────────────────────────
create table if not exists public.escalas (
  id                  uuid primary key default uuid_generate_v4(),
  ciclo_id            uuid not null references public.ciclos(id) on delete cascade,
  user_id             uuid not null references public.users(id) on delete cascade,
  domingo             date not null,
  subdepartamento     text not null,
  status_confirmacao  text not null default 'pendente'
                      check (status_confirmacao in ('pendente','confirmado','recusado')),
  created_at          timestamptz not null default now()
);

create index if not exists escalas_ciclo_user on public.escalas (ciclo_id, user_id);
create index if not exists escalas_domingo    on public.escalas (domingo);

-- ── TROCAS ───────────────────────────────────────────────────────────────────
create table if not exists public.trocas (
  id             uuid primary key default uuid_generate_v4(),
  escala_id      uuid not null references public.escalas(id) on delete cascade,
  solicitante_id uuid not null references public.users(id),
  motivo         text,
  status         text not null default 'pendente'
                 check (status in ('pendente','aprovado','recusado')),
  aprovado_por   uuid references public.users(id),
  created_at     timestamptz not null default now()
);

-- ── VISITANTES ───────────────────────────────────────────────────────────────
create table if not exists public.visitantes (
  id                     uuid primary key default uuid_generate_v4(),
  nome                   text not null,
  idade                  integer,
  estado_civil           text,
  endereco               text,
  igreja                 text,
  motivo                 text,
  data_visita            date not null default current_date,
  status_acompanhamento  text not null default 'novo'
                         check (status_acompanhamento in ('novo','recorrente','acompanhado','integrado')),
  registrado_por         uuid references public.users(id),
  created_at             timestamptz not null default now()
);

create index if not exists visitantes_data on public.visitantes (data_visita desc);

-- ── CONTEÚDO LOGIN (carrossel) ───────────────────────────────────────────────
create table if not exists public.conteudo_login (
  id          uuid primary key default uuid_generate_v4(),
  tipo        text not null check (tipo in ('foto','video','anuncio')),
  url         text,
  descricao   text not null,
  status      text not null default 'pendente'
              check (status in ('pendente','aprovado','recusado')),
  criado_por  uuid references public.users(id),
  aprovado_por uuid references public.users(id),
  criado_em   timestamptz not null default now()
);

-- ── COMUNICADOS ──────────────────────────────────────────────────────────────
create table if not exists public.comunicados (
  id            uuid primary key default uuid_generate_v4(),
  autor_id      uuid not null references public.users(id),
  destinatario  text not null default 'todos',
  texto         text not null,
  criado_em     timestamptz not null default now()
);

-- ── REAÇÕES DE COMUNICADOS ───────────────────────────────────────────────────
create table if not exists public.comunicado_reacoes (
  id            uuid primary key default uuid_generate_v4(),
  comunicado_id uuid not null references public.comunicados(id) on delete cascade,
  user_id       uuid not null references public.users(id) on delete cascade,
  emoji         text not null check (emoji in ('🙏','🔥','❤️','👏','😂')),
  created_at    timestamptz not null default now(),
  unique (comunicado_id, user_id, emoji)
);

-- ── NOTIFICAÇÕES LOG ─────────────────────────────────────────────────────────
create table if not exists public.notificacoes_log (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid references public.users(id),
  tipo        text not null,
  mensagem    text not null,
  enviado_em  timestamptz not null default now()
);

-- ============================================================
-- RLS Policies
-- ============================================================

-- Enable RLS on all tables
alter table public.perfis         enable row level security;
alter table public.users          enable row level security;
alter table public.ciclos         enable row level security;
alter table public.briefings      enable row level security;
alter table public.disponibilidades enable row level security;
alter table public.escalas        enable row level security;
alter table public.trocas         enable row level security;
alter table public.visitantes     enable row level security;
alter table public.conteudo_login enable row level security;
alter table public.comunicados          enable row level security;
alter table public.comunicado_reacoes   enable row level security;
alter table public.notificacoes_log enable row level security;

-- Helper: get current user's role
create or replace function public.current_user_role()
returns text language sql security definer stable as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.is_lider()
returns boolean language sql security definer stable as $$
  select role in ('lider_geral','lider_funcao') from public.users where id = auth.uid()
$$;

-- Check if user has a specific action permission via perfis table
create or replace function public.user_has_action(action_name text)
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.perfis p
    join public.users u on u.role = p.nome
    where u.id = auth.uid()
    and action_name = any(p.acoes)
  )
$$;

-- PERFIS policies — all authenticated can read; only lider_geral can write
create policy "Perfis: all read"    on public.perfis for select using (auth.uid() is not null);
create policy "Perfis: lider write" on public.perfis for insert  with check (public.current_user_role() = 'lider_geral');
create policy "Perfis: lider update" on public.perfis for update using (public.current_user_role() = 'lider_geral');
create policy "Perfis: lider delete" on public.perfis for delete using (public.current_user_role() = 'lider_geral');

-- USERS policies
create policy "Users: read own or lider reads all"
  on public.users for select
  using (id = auth.uid() or public.is_lider());

create policy "Users: insert own on register"
  on public.users for insert
  with check (id = auth.uid());

create policy "Users: update own or lider updates all"
  on public.users for update
  using (id = auth.uid() or public.current_user_role() = 'lider_geral');

create policy "Users: delete only lider_geral"
  on public.users for delete
  using (public.current_user_role() = 'lider_geral');

-- CICLOS — all authenticated can read
create policy "Ciclos: all read"    on public.ciclos for select using (auth.uid() is not null);
create policy "Ciclos: lider write" on public.ciclos for all
  using (public.is_lider()) with check (public.is_lider());

-- BRIEFINGS — all read; lider/membro_serve write
create policy "Briefings: all read"  on public.briefings for select using (auth.uid() is not null);
create policy "Briefings: write"     on public.briefings for all
  using (public.current_user_role() in ('lider_geral','lider_funcao','membro_serve'))
  with check (public.current_user_role() in ('lider_geral','lider_funcao','membro_serve'));

-- DISPONIBILIDADES — member reads/writes own; lider reads all
create policy "Disp: own"        on public.disponibilidades for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Disp: lider read" on public.disponibilidades for select using (public.is_lider());

-- ESCALAS — all read; lider writes; member updates own
create policy "Escala: all read"     on public.escalas for select using (auth.uid() is not null);
create policy "Escala: lider write"  on public.escalas for insert  with check (public.is_lider());
create policy "Escala: confirm own"  on public.escalas for update  using (user_id = auth.uid() or public.is_lider());

-- TROCAS
create policy "Trocas: own or lider"
  on public.trocas for all
  using (solicitante_id = auth.uid() or public.is_lider())
  with check (solicitante_id = auth.uid() or public.is_lider());

-- VISITANTES — serve/lider/custom profiles with registrar_visitante can write; all read
create policy "Visit: all read"    on public.visitantes for select using (auth.uid() is not null);
create policy "Visit: serve write" on public.visitantes for all
  using (public.current_user_role() in ('lider_geral','lider_funcao','membro_serve') or public.user_has_action('registrar_visitante'))
  with check (public.current_user_role() in ('lider_geral','lider_funcao','membro_serve') or public.user_has_action('registrar_visitante'));

-- CONTEÚDO LOGIN — approved: all read; pending: own or lider
create policy "Media: public read" on public.conteudo_login for select
  using (status = 'aprovado' or criado_por = auth.uid() or public.is_lider());
create policy "Media: write"       on public.conteudo_login for all
  using (criado_por = auth.uid() or public.is_lider())
  with check (criado_por = auth.uid() or public.is_lider());

-- COMUNICADOS
create policy "Com: all read"    on public.comunicados for select using (auth.uid() is not null);
create policy "Com: lider write" on public.comunicados for insert  with check (public.is_lider());

-- COMUNICADO REAÇÕES
create policy "reacoes_select" on public.comunicado_reacoes for select using (auth.uid() is not null);
create policy "reacoes_insert" on public.comunicado_reacoes for insert with check (auth.uid() = user_id);
create policy "reacoes_delete" on public.comunicado_reacoes for delete using (auth.uid() = user_id);

-- NOTIFICACOES_LOG — lider only
create policy "Log: lider"
  on public.notificacoes_log for all
  using (public.is_lider()) with check (public.is_lider());

-- ============================================================
-- Triggers
-- ============================================================

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger trg_briefings_updated_at
  before update on public.briefings
  for each row execute function public.set_updated_at();

-- ============================================================
-- Auto-promoção: líder geral fundador
-- Ao cadastrar com o email abaixo, a conta é promovida
-- automaticamente para líder_geral e ativada.
-- ============================================================

create or replace function public.auto_promote_founder()
returns trigger language plpgsql security definer as $$
begin
  if new.email = 'pedrohenri1998.phn@gmail.com' then
    new.role  := 'lider_geral';
    new.ativo := true;
  end if;
  return new;
end;
$$;

create trigger trg_auto_promote_founder
  before insert on public.users
  for each row execute function public.auto_promote_founder();

-- ============================================================
-- Seed: default profiles
-- ============================================================
insert into public.perfis (nome, label, descricao, protegido, telas, acoes, campos_visiveis) values
  ('lider_geral', 'Líder Geral', 'Acesso total ao sistema', true,
    array['dashboard','escalas','briefings','disponibilidade','visitantes','membros','relatorios','comunicados','midia_login','configuracoes'],
    array['aprovar_cadastro','aprovar_troca','aprovar_midia','editar_membro','excluir_membro','promover_membro','editar_tarja','preencher_briefing','confirmar_presenca','solicitar_troca','registrar_visitante','criar_comunicado','ver_relatorios','gerenciar_perfis'],
    array['tarja','dados_pessoais','historico_servico','escala_geral','escala_propria','briefing_completo','saude_subdeps','alertas_sistema','dados_visitantes']
  ),
  ('lider_funcao', 'Líder de Função', 'Líder de subdepartamento', true,
    array['dashboard','escalas','briefings','disponibilidade','comunicados'],
    array['preencher_briefing','confirmar_presenca','solicitar_troca'],
    array['historico_servico','escala_geral','briefing_completo','saude_subdeps']
  ),
  ('membro_serve', 'Membro que Serve', 'Membro ativo que serve em escalas', true,
    array['dashboard','escalas','disponibilidade'],
    array['confirmar_presenca','solicitar_troca'],
    array['historico_servico','escala_propria']
  ),
  ('membro_observador', 'Observador', 'Membro com acesso limitado', true,
    array['escalas'],
    array[]::text[],
    array['escala_geral','briefing_completo']
  )
on conflict (nome) do nothing;

-- ============================================================
-- Seed: first cycle (optional — remove if creating via app)
-- ============================================================
-- insert into public.ciclos (inicio, fim, status) values
--   (current_date, current_date + interval '44 days', 'briefing_regente');
