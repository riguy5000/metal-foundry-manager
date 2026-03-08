ALTER TABLE public.casting_records DROP CONSTRAINT IF EXISTS casting_records_extracted_by_user_id_fkey;
ALTER TABLE public.casting_records
  ADD CONSTRAINT casting_records_extracted_by_user_id_fkey
  FOREIGN KEY (extracted_by_user_id) REFERENCES public.profiles(id);

ALTER TABLE public.casting_records DROP CONSTRAINT IF EXISTS casting_records_completed_by_user_id_fkey;
ALTER TABLE public.casting_records
  ADD CONSTRAINT casting_records_completed_by_user_id_fkey
  FOREIGN KEY (completed_by_user_id) REFERENCES public.profiles(id);