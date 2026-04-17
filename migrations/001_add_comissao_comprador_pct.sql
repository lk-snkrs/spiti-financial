-- Custom buyer commission percentage for post-auction sales.
-- NULL means use the default tiered formula (10% up to 100k, 7.5% 100-200k, 5% above).
ALTER TABLE spiti_vendas ADD COLUMN IF NOT EXISTS comissao_comprador_pct numeric;
