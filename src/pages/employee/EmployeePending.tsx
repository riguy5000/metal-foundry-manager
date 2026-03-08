import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { getMetalCardClass, getMetalEmoji } from '@/lib/metalUtils';
import { Clock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, differenceInHours, format } from 'date-fns';
import { Badge } from '@/components/ui/badge';

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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pending Castings</h1>
          <p className="text-sm text-muted-foreground">Tap to complete a casting</p>
        </div>
        {castings && castings.length > 0 && (
          <div className="flex items-center justify-center h-8 w-8 rounded-full bg-foreground text-background text-sm font-bold">
            {castings.length}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : castings?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Clock className="h-12 w-12 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground font-medium">No pending castings</p>
          <p className="text-sm text-muted-foreground">Extract metal first to create a casting</p>
        </div>
      ) : (
        <div className="space-y-4">
          {castings?.map((c, idx) => {
            const mt = c.metal_types as any;
            const cardClass = getMetalCardClass(mt?.color_group ?? '', mt?.metal_family ?? '');
            const emoji = getMetalEmoji(mt?.color_group ?? '', mt?.metal_family ?? '');
            const hoursAgo = differenceInHours(new Date(), new Date(c.extracted_at));
            const isAging = hoursAgo >= 2;
            // Number from oldest (1) to newest
            const itemNumber = castings!.length - idx;

            return (
              <button
                key={c.id}
                onClick={() => navigate(`/employee/complete/${c.id}`)}
                className={cn(
                  'flex w-full items-center rounded-xl p-5 text-left transition-all hover:shadow-md active:scale-[0.99] border',
                  cardClass
                )}
              >
                {/* Sequence number */}
                <div className="flex items-center justify-center h-9 w-9 rounded-full bg-foreground/10 text-foreground font-bold text-sm mr-4 shrink-0">
                  #{itemNumber}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="text-lg">{emoji}</span>
                    <span className="font-semibold text-foreground">{mt?.metal_name}</span>
                    <Badge variant="outline" className="font-mono text-xs bg-background/60">
                      {c.casting_code}
                    </Badge>
                    {isAging && (
                      <Badge className="bg-warning/20 text-warning border-warning/30 text-xs">
                        {hoursAgo}h — Aging
                      </Badge>
                    )}
                  </div>
                  <div className="font-mono text-4xl font-bold text-foreground leading-none">
                    {Number(c.extracted_grams).toFixed(2)}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    <span>g extracted</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span>{formatDistanceToNow(new Date(c.extracted_at), { addSuffix: true })}</span>
                    <span className="text-border">•</span>
                    <span className="font-mono">{format(new Date(c.extracted_at), 'MMM d, yyyy · h:mm a')}</span>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
