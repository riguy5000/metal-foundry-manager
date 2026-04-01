
ALTER TABLE public.inventory_transactions
  ADD COLUMN IF NOT EXISTS stock_before_grams numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stock_after_grams numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS related_casting_code text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS performed_by_name text DEFAULT NULL;
