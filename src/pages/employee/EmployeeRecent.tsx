import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getMetalDotClass } from '@/lib/metalUtils';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { History } from 'lucide-react';

export default function EmployeeRecent() {
  const { data: castings, isLoading } = useQuery({
    queryKey: ['my_castings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('casting_records')
        .select('*, metal_types(metal_name, karat_label, color_group, metal_family)')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="p-4">
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">Recent Activity</h1>
        <p className="text-sm text-muted-foreground">Your recent casting records</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : castings?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <History className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground font-medium">No recent activity</p>
        </div>
      ) : (
        <div className="space-y-2">
          {castings?.map((c) => {
            const mt = c.metal_types as any;
            const dotClass = getMetalDotClass(mt?.color_group ?? '', mt?.metal_family ?? '');
            const statusLabel = c.status === 'extracted_pending_completion' ? 'Pending' :
                               c.status === 'completed' ? 'Complete' : 'Flagged';
            const statusVariant = c.status === 'completed' ? 'bg-success/10 text-success border-success/20' :
                                 c.status === 'extracted_pending_completion' ? 'bg-warning/10 text-warning border-warning/20' :
                                 'bg-destructive/10 text-destructive border-destructive/20';
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-xl bg-card border border-border px-4 py-3"
              >
                <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', dotClass)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold">{c.casting_code}</span>
                    <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', statusVariant)}>
                      {statusLabel}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {mt?.metal_name} · {Number(c.extracted_grams).toFixed(2)}g
                  </div>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {format(new Date(c.created_at), 'MMM d')}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
