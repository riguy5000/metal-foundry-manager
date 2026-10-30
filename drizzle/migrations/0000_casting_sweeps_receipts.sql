CREATE TABLE public.sweeps_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 metal_family text NOT NULL,
 grams numeric(12,2) NOT NULL CHECK (grams > 0),
 received_on date NOT NULL DEFAULT CURRENT_DATE,
 notes text,
 received_by_user_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 voided_at timestamptz,
 void_reason text
);
GRANT SELECT ON public.sweeps_receipts TO authenticated;
GRANT ALL ON public.sweeps_receipts TO service_role;
ALTER TABLE public.sweeps_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read sweeps receipts" ON public.sweeps_receipts FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.sweeps_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 receipt_id uuid NOT NULL REFERENCES public.sweeps_receipts(id),
 casting_id uuid NOT NULL REFERENCES public.casting_records(id) ON DELETE RESTRICT,
 grams numeric(12,2) NOT NULL CHECK (grams > 0),
 UNIQUE(receipt_id, casting_id)
);
GRANT SELECT ON public.sweeps_allocations TO authenticated;
GRANT ALL ON public.sweeps_allocations TO service_role;
ALTER TABLE public.sweeps_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read sweeps allocations" ON public.sweeps_allocations FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX sweeps_allocations_casting_idx ON public.sweeps_allocations(casting_id);
CREATE OR REPLACE FUNCTION public.record_sweeps_receipt(p_family text, p_grams numeric, p_received_on date, p_casting_ids uuid[], p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_total numeric; v_credit_cents bigint; v_count integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
 IF p_grams IS NULL OR p_grams <= 0 OR p_grams <> round(p_grams,2) OR p_received_on IS NULL THEN RAISE EXCEPTION 'Enter a positive sweeps weight to 0.01g and a receipt date'; END IF;
 IF cardinality(p_casting_ids) IS NULL OR cardinality(p_casting_ids) = 0 THEN RAISE EXCEPTION 'Select the castings covered by this bag'; END IF;
 PERFORM id FROM public.casting_records WHERE id = ANY(p_casting_ids) ORDER BY id FOR UPDATE;
 SELECT count(*) INTO v_count FROM public.casting_records c JOIN public.metal_types m ON m.id=c.metal_type_id WHERE c.id=ANY(p_casting_ids) AND c.status IN ('completed','flagged') AND m.metal_family=p_family;
 IF v_count <> cardinality(p_casting_ids) THEN RAISE EXCEPTION 'Select unique finalized castings from one metal family only'; END IF;
 SELECT sum(greatest(0, round(c.extracted_grams-c.sprue_transferred_to_next_casting_grams-coalesce(c.finished_jewelry_grams,0)-coalesce(c.returned_button_grams,0),2)-coalesce((SELECT sum(a.grams) FROM public.sweeps_allocations a JOIN public.sweeps_receipts r ON r.id=a.receipt_id WHERE a.casting_id=c.id AND r.voided_at IS NULL),0))) INTO v_total FROM public.casting_records c WHERE c.id=ANY(p_casting_ids);
 IF v_total <= 0 THEN RAISE EXCEPTION 'Selected castings have no remaining loss to cover'; END IF;
 v_credit_cents := least(p_grams,v_total)*100;
 INSERT INTO public.sweeps_receipts(metal_family,grams,received_on,notes,received_by_user_id) VALUES(p_family,p_grams,p_received_on,nullif(trim(p_notes),''),auth.uid()) RETURNING id INTO v_id;
 WITH losses AS (
 SELECT c.id, greatest(0,round(c.extracted_grams-c.sprue_transferred_to_next_casting_grams-coalesce(c.finished_jewelry_grams,0)-coalesce(c.returned_button_grams,0),2)-coalesce((SELECT sum(a.grams) FROM public.sweeps_allocations a JOIN public.sweeps_receipts r ON r.id=a.receipt_id WHERE a.casting_id=c.id AND r.voided_at IS NULL),0))*100 AS cents FROM public.casting_records c WHERE c.id=ANY(p_casting_ids)
 ), shares AS (SELECT id, v_credit_cents*cents/(v_total*100) AS exact FROM losses WHERE cents>0), ranked AS (
 SELECT id, floor(exact) AS base, row_number() OVER(ORDER BY exact-floor(exact) DESC,id) AS rank, v_credit_cents-sum(floor(exact)) OVER() AS extra FROM shares
 ) INSERT INTO public.sweeps_allocations(receipt_id,casting_id,grams) SELECT v_id,id,(base+CASE WHEN rank<=extra THEN 1 ELSE 0 END)/100 FROM ranked WHERE base+CASE WHEN rank<=extra THEN 1 ELSE 0 END>0;
 INSERT INTO public.audit_logs(user_id,action_type,entity_type,entity_id,after_json) VALUES(auth.uid(),'record_sweeps','sweeps_receipt',v_id,jsonb_build_object('metal_family',p_family,'grams',p_grams,'received_on',p_received_on,'casting_ids',p_casting_ids,'credited_grams',v_credit_cents/100.0,'unallocated_grams',p_grams-v_credit_cents/100.0));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.record_sweeps_receipt(text,numeric,date,uuid[],text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_sweeps_receipt(text,numeric,date,uuid[],text) TO authenticated;
CREATE OR REPLACE FUNCTION public.void_sweeps_receipt(p_receipt_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_before jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Admin access required'; END IF;
 IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'A correction reason is required'; END IF;
 PERFORM c.id FROM public.casting_records c JOIN public.sweeps_allocations a ON a.casting_id=c.id WHERE a.receipt_id=p_receipt_id ORDER BY c.id FOR UPDATE OF c;
 SELECT to_jsonb(r) INTO v_before FROM public.sweeps_receipts r WHERE id=p_receipt_id AND voided_at IS NULL FOR UPDATE;
 IF v_before IS NULL THEN RAISE EXCEPTION 'Receipt not found or already voided'; END IF;
 UPDATE public.sweeps_receipts SET voided_at=now(),void_reason=trim(p_reason) WHERE id=p_receipt_id;
 INSERT INTO public.audit_logs(user_id,action_type,entity_type,entity_id,before_json,after_json) VALUES(auth.uid(),'void_sweeps','sweeps_receipt',p_receipt_id,v_before,jsonb_build_object('reason',trim(p_reason)));
END $$;
REVOKE ALL ON FUNCTION public.void_sweeps_receipt(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.void_sweeps_receipt(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.protect_casting_sweeps_credit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_credit numeric;
BEGIN
 SELECT coalesce(sum(a.grams),0) INTO v_credit FROM public.sweeps_allocations a JOIN public.sweeps_receipts r ON r.id=a.receipt_id WHERE a.casting_id=NEW.id AND r.voided_at IS NULL;
 IF v_credit>0 AND (NEW.metal_type_id<>OLD.metal_type_id OR NEW.status NOT IN ('completed','flagged') OR round(NEW.extracted_grams-NEW.sprue_transferred_to_next_casting_grams-coalesce(NEW.finished_jewelry_grams,0)-coalesce(NEW.returned_button_grams,0),2)<v_credit) THEN RAISE EXCEPTION 'Void the associated sweeps receipt before changing this casting below its sweeps credit'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER protect_casting_sweeps_credit BEFORE UPDATE ON public.casting_records FOR EACH ROW EXECUTE FUNCTION public.protect_casting_sweeps_credit();