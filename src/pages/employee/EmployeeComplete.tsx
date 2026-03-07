import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useState } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { getMetalDotClass } from '@/lib/metalUtils';
import { cn } from '@/lib/utils';

export default function EmployeeComplete() {
  const { castingId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [returnedGrams, setReturnedGrams] = useState('');
  const [jewelryGrams, setJewelryGrams] = useState('');
  const [abnormalityNote, setAbnormalityNote] = useState('');
  const [success, setSuccess] = useState(false);

  const { data: casting } = useQuery({
    queryKey: ['casting_record', castingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('casting_records')
        .select('*, metal_types(id, metal_name, karat_label, color_group, metal_family, current_stock_grams)')
        .eq('id', castingId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!castingId,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('*').limit(1).maybeSingle();
      return data;
    },
  });

  const returned = parseFloat(returnedGrams) || 0;
  const jewelry = parseFloat(jewelryGrams) || 0;
  const extracted = casting ? Number(casting.extracted_grams) : 0;
  const totalAccounted = returned + jewelry;
  const difference = extracted - totalAccounted;

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!casting || !user) throw new Error('Missing data');
      const tolerance = settings?.default_discrepancy_tolerance_percent ?? 2;
      const discrepancyPercent = extracted > 0 ? (difference / extracted) * 100 : 0;
      const flag = Math.abs(discrepancyPercent) > Number(tolerance);

      const { error } = await supabase.from('casting_records').update({
        returned_button_grams: returned,
        finished_jewelry_grams: jewelry,
        discrepancy_grams: difference,
        discrepancy_percent: discrepancyPercent,
        tolerance_percent_used: Number(tolerance),
        discrepancy_flag: flag,
        status: flag ? 'flagged' : 'completed',
        completed_by_user_id: user.id,
        completed_at: new Date().toISOString(),
        abnormality_note: abnormalityNote || null,
      }).eq('id', casting.id);
      if (error) throw error;

      // Return button weight to stock
      if (returned > 0) {
        const mt = casting.metal_types as any;
        await supabase.from('metal_types').update({
          current_stock_grams: Number(mt.current_stock_grams) + returned,
        }).eq('id', mt.id);
        await supabase.from('inventory_transactions').insert({
          metal_type_id: mt.id,
          grams: returned,
          transaction_type: 'return_from_casting',
          entered_by_user_id: user.id,
          notes: `Return from casting ${casting.casting_code}`,
          related_casting_id: casting.id,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      queryClient.invalidateQueries({ queryKey: ['my_pending'] });
      queryClient.invalidateQueries({ queryKey: ['my_castings'] });
      setSuccess(true);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Success screen — neutral, no discrepancy info for employees
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[60vh]">
        <div className="rounded-full bg-success/10 p-4 mb-4">
          <CheckCircle2 className="h-12 w-12 text-success" />
        </div>
        <h2 className="text-xl font-bold mb-1">Casting Complete</h2>
        <p className="text-muted-foreground mb-6">
          {casting?.casting_code} has been recorded successfully
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate('/employee')}>
            Back to Metals
          </Button>
          <Button onClick={() => navigate('/employee/pending')}>
            View Pending
          </Button>
        </div>
      </div>
    );
  }

  if (!casting) {
    return (
      <div className="p-4">
        <div className="h-48 bg-muted rounded-lg animate-pulse" />
      </div>
    );
  }

  const mt = casting.metal_types as any;
  const dotClass = getMetalDotClass(mt?.color_group ?? '', mt?.metal_family ?? '');

  return (
    <div className="p-4 max-w-lg mx-auto">
      <button
        onClick={() => navigate('/employee/pending')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Pending
      </button>

      {/* Casting info */}
      <div className="rounded-xl bg-card border border-border p-5 mb-5">
        <div className="flex items-center gap-2 mb-2">
          <div className={cn('h-3 w-3 rounded-full', dotClass)} />
          <span className="text-sm text-muted-foreground">{mt?.metal_name}</span>
        </div>
        <div className="font-mono text-xl font-bold mb-3">{casting.casting_code}</div>
        <div className="rounded-lg bg-muted px-4 py-3">
          <div className="text-xs text-muted-foreground mb-0.5">Metal Extracted</div>
          <div className="font-mono text-3xl font-bold">{extracted.toFixed(2)}<span className="text-sm text-muted-foreground ml-1">g</span></div>
        </div>
      </div>

      {/* Completion form */}
      <div className="space-y-5">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Finished Jewelry Weight (g)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={jewelryGrams}
            onChange={(e) => setJewelryGrams(e.target.value)}
            placeholder="0.00"
            className="h-14 text-2xl font-mono text-center"
            inputMode="decimal"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Returned Sprue/Button Weight (g)</Label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={returnedGrams}
            onChange={(e) => setReturnedGrams(e.target.value)}
            placeholder="0.00"
            className="h-14 text-2xl font-mono text-center"
            inputMode="decimal"
          />
        </div>

        {/* Live reconciliation — neutral for employee (no red/green discrepancy) */}
        {(returned > 0 || jewelry > 0) && (
          <div className="rounded-xl bg-muted p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Extracted</span>
              <span className="font-mono font-semibold">{extracted.toFixed(2)}g</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Jewelry + Returned</span>
              <span className="font-mono font-semibold">{totalAccounted.toFixed(2)}g</span>
            </div>
            <div className="border-t border-border pt-2 flex justify-between text-sm">
              <span className="text-muted-foreground">Difference</span>
              <span className="font-mono font-semibold">{difference.toFixed(2)}g</span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-sm font-medium">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Textarea
            value={abnormalityNote}
            onChange={(e) => setAbnormalityNote(e.target.value)}
            placeholder="Any abnormalities or observations"
            className="min-h-[80px]"
          />
        </div>

        <Button
          onClick={() => completeMutation.mutate()}
          disabled={completeMutation.isPending || (returned <= 0 && jewelry <= 0)}
          className="w-full h-14 text-base font-semibold"
          size="lg"
        >
          {completeMutation.isPending ? 'Completing...' : 'Complete Casting'}
        </Button>
      </div>
    </div>
  );
}
