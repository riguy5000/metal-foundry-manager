
-- Add new casting status
ALTER TYPE public.casting_status ADD VALUE IF NOT EXISTS 'open_with_sprue_transfer';

-- Add new transaction type
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'sprue_transfer_from_open_casting';

-- Add new columns to casting_records
ALTER TABLE public.casting_records
  ADD COLUMN IF NOT EXISTS sprue_transferred_to_next_casting_grams numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_unfinalized_balance_grams numeric,
  ADD COLUMN IF NOT EXISTS has_sprue_transfer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_sprue_transfer_at timestamptz,
  ADD COLUMN IF NOT EXISTS sprue_transfer_notes text;
