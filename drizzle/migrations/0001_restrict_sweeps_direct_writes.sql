REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.sweeps_receipts FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.sweeps_allocations FROM authenticated, anon;
REVOKE SELECT ON public.sweeps_receipts, public.sweeps_allocations FROM anon;
COMMENT ON TABLE public.sweeps_receipts IS 'Admin sweeps receipts. Write only via authorized transactional functions. Dust remains separate from usable stock.';