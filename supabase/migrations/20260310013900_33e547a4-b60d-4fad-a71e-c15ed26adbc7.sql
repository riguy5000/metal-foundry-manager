CREATE POLICY "Admins can update transactions"
ON public.inventory_transactions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete transactions"
ON public.inventory_transactions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));