import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { getMetalDotClass } from '@/lib/metalUtils';
import { Clock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

export default function EmployeePending() {
  const navigate = useNavigate();

  const { data: castings, isLoading } = useQuery({
    queryKey: ['my_pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('casting_records')
        .select('*, metal_types(metal_name, karat_label, color_group, metal_family)')
        .eq('status', 'extracted_pending_completion')
        .order('extracted_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="p-4">
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">Pending Castings</h1>
        <p className="text-sm text-muted-foreground">Tap to complete after casting</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : castings?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Clock className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground font-medium">No pending castings</p>
          <p className="text-sm text-muted-foreground">Extract metal first to create a casting</p>
        </div>
      ) : (
        <div className="space-y-3">
          {castings?.map((c) => {
            const mt = c.metal_types as any;
            const dotClass = getMetalDotClass(mt?.color_group ?? '', mt?.metal_family ?? '');
            return (
              <button
                key={c.id}
                onClick={() => navigate(`/employee/complete/${c.id}`)}
                className="flex w-full items-center gap-4 rounded-xl bg-card border border-border p-4 text-left transition-all hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={cn('h-2.5 w-2.5 rounded-full', dotClass)} />
                    <span className="text-xs text-muted-foreground">{mt?.metal_name}</span>
                  </div>
                  <div className="font-mono text-base font-bold">{c.casting_code}</div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="text-sm text-muted-foreground">
                      <span className="font-mono font-semibold text-foreground">{Number(c.extracted_grams).toFixed(2)}g</span> extracted
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(c.extracted_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
