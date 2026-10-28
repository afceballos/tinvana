-- Last time the stock of a saved product was checked with Dropi from its landing (buy button or form), so the check
-- is reused for 10 minutes instead of asking Dropi on every click.
ALTER TABLE selected_products ADD COLUMN IF NOT EXISTS stock_checked_at timestamptz;
