-- Tentativas de acesso erradas por IP, para limitar adivinhacao de codigo (codigo de 4 caracteres e curto).
create table if not exists public.access_fails (
  id bigint generated always as identity primary key,
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists access_fails_ip_at on public.access_fails (ip, at desc);
alter table public.access_fails enable row level security;
revoke all on public.access_fails from anon, authenticated;
