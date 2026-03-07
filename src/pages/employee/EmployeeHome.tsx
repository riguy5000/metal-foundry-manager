import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { getMetalCardClass, getMetalDotClass } from '@/lib/metalUtils';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function EmployeeHome() {
  const navigate = useNavigate();

  const { data: metals, isLoading } = useQuery({
    queryKey: ['metal_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('metal_types')
        .select('*')
        .eq('active_status', true)
        .order('display_order');
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-2">
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">Select Metal</h1>
        <p className="text-sm text-muted-foreground">Tap a metal to extract for casting</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {metals?.map((metal) => {
          const lowStock = metal.low_stock_warning_enabled &&
            metal.current_stock_grams < metal.minimum_threshold_grams;
          const cardClass = getMetalCardClass(metal.color_group, metal.metal_family);
          const dotClass = getMetalDotClass(metal.color_group, metal.metal_family);

          return (
            <button
              key={metal.id}
              onClick={() => navigate(`/employee/extract/${metal.id}`)}
              className={cn(
                'relative flex flex-col items-start rounded-xl p-4 text-left transition-all',
                'active:scale-[0.98] hover:shadow-md',
                'min-h-[120px]',
                cardClass
              )}
            >
              {/* Color dot + Family indicator */}
              <div className="flex items-center gap-2 mb-2">
                <div className={cn('h-3 w-3 rounded-full', dotClass)} />
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {metal.karat_label}
                </span>
              </div>

              {/* Metal name */}
              <span className="text-sm font-semibold leading-tight text-foreground mb-auto">
                {metal.metal_name}
              </span>

              {/* Stock display */}
              <div className="flex items-end justify-between w-full mt-3">
                <div>
                  <span className="font-mono text-2xl font-bold leading-none text-foreground">
                    {Number(metal.current_stock_grams).toFixed(1)}
                  </span>
                  <span className="text-xs text-muted-foreground ml-0.5">g</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </div>

              {/* Low stock badge */}
              {lowStock && (
                <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5">
                  <AlertTriangle className="h-3 w-3 text-destructive" />
                  <span className="text-[10px] font-semibold text-destructive">LOW</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
