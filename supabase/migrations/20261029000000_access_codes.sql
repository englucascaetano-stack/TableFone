-- Codigo de acesso do grupo, definido pelo mestre (segredo MASTER_KEY da funcao "mesa").
-- Guarda so o hash (SHA-256) do codigo; o codigo em si aparece uma unica vez, ao ser criado.
create table if not exists public.access_codes (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 1 and 40),
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz
);
-- RLS ligada e sem politicas: so a funcao (service role) le e grava; a chave publica nao enxerga nada.
alter table public.access_codes enable row level security;
revoke all on public.access_codes from anon, authenticated;
