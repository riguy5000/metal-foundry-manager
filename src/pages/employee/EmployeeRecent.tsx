import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getMetalCardClass, getMetalEmoji } from '@/lib/metalUtils';
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
        <h1 className="text-2xl font-bold tracking-tight">Recent Activity</h1>
        <p className="text-sm text-muted-foreground">Your recent extractions and completions</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : castings?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <History className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground font-medium">No recent activity</p>
        </div>
      ) : (
        <div className="space-y-3">
          {castings?.map((c) => {
            const mt = c.metal_types as any;
            const cardClass = getMetalCardClass(mt?.color_group ?? '', mt?.metal_family ?? '');
            const emoji = getMetalEmoji(mt?.color_group ?? '', mt?.metal_family ?? '');
            const isPending = c.status === 'extracted_pending_completion';
            const isCompleted = c.status === 'completed';
            const isFlagged = c.status === 'flagged';

            return (
              <div
                key={c.id}
                className={cn(
                  'rounded-xl border p-4',
                  cardClass
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{emoji}</span>
                    <span className="font-semibold text-foreground">{mt?.metal_name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{c.casting_code}</span>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-xs font-medium',
                      isPending && 'bg-muted text-foreground',
                      isCompleted && 'bg-success/10 text-success border-success/30',
                      isFlagged && 'bg-destructive/10 text-destructive border-destructive/30',
                    )}
                  >
                    {isPending ? 'Pending' : isCompleted ? 'Done' : 'Flagged'}
                  </Badge>
                </div>
                <div className="flex items-baseline gap-4 flex-wrap">
                  <div>
                    <span className="font-mono text-3xl font-bold text-foreground">{Number(c.extracted_grams).toFixed(2)}</span>
                    <span className="text-sm text-muted-foreground ml-1">g out</span>
                  </div>
                  {c.finished_jewelry_grams != null && (
                    <div>
                      <span className="font-mono text-lg font-semibold text-foreground">{Number(c.finished_jewelry_grams).toFixed(2)}</span>
                      <span className="text-xs text-muted-foreground ml-1">g jewelry</span>
                    </div>
                  )}
                  {c.returned_button_grams != null && (
                    <div>
                      <span className="font-mono text-lg font-semibold text-foreground">{Number(c.returned_button_grams).toFixed(2)}</span>
                      <span className="text-xs text-muted-foreground ml-1">g returned</span>
                    </div>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  {format(new Date(c.created_at), 'M/d/yyyy · hh:mm a')}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
