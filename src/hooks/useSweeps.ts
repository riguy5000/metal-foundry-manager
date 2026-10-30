import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useSweeps() {
  return useQuery({
    queryKey: ['sweeps'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sweeps_receipts')
        .select('*, sweeps_allocations(casting_id, grams, casting_records(casting_code))')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useSweepsCredits() {
  const query = useSweeps();
  const credits: Record<string, number> = {};
  for (const receipt of query.data ?? []) {
    if (receipt.voided_at) continue;
    for (const allocation of receipt.sweeps_allocations) {
      credits[allocation.casting_id] = Math.round(((credits[allocation.casting_id] ?? 0) + Number(allocation.grams)) * 100) / 100;
    }
  }
  return { ...query, credits };
}