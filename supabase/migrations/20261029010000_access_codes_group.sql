-- O codigo e unico para o grupo e o mestre pode revê-lo no painel: guarda o texto alem do hash (tabela so acessivel pela funcao).
alter table public.access_codes add column if not exists code_plain text;
