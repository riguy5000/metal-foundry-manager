
CREATE POLICY "Admins can delete castings"
ON public.casting_records
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
