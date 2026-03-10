
ALTER TABLE public.casting_records 
  ADD COLUMN IF NOT EXISTS source_from_inventory_grams numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_from_open_casting_grams numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_open_casting_id uuid REFERENCES public.casting_records(id);

-- Backfill: existing castings sourced entirely from inventory
UPDATE public.casting_records 
SET source_from_inventory_grams = extracted_grams
WHERE source_from_inventory_grams = 0;

-- Set remaining_unfinalized_balance_grams for open castings that don't have it set
UPDATE public.casting_records 
SET remaining_unfinalized_balance_grams = extracted_grams - sprue_transferred_to_next_casting_grams - COALESCE(finished_jewelry_grams, 0) - COALESCE(returned_button_grams, 0)
WHERE status IN ('extracted_pending_completion', 'open_with_sprue_transfer')
  AND remaining_unfinalized_balance_grams IS NULL;
