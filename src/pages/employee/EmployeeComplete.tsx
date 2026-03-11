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
import { ArrowLeft, ArrowRightLeft, Gem, CircleDot } from 'lucide-react';
import { getMetalCardClass, getMetalEmoji } from '@/lib/metalUtils';
import { applyMetalStockDelta } from '@/lib/inventoryUtils';
import { cn } from '@/lib/utils';

export default function EmployeeComplete() {
  const { castingId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [returnedGrams, setReturnedGrams] = useState('');
  const [jewelryGrams, setJewelryGrams] = useState('');
  const [abnormalityNote, setAbnormalityNote] = useState('');

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
  const alreadyTransferred = casting ? Number(casting.sprue_transferred_to_next_casting_grams ?? 0) : 0;
  const sourceFromOpenCasting = casting ? Number(casting.source_from_open_casting_grams ?? 0) : 0;
  const sourceFromInventory = casting ? Number(casting.source_from_inventory_grams ?? 0) : 0;
  const remainingBalance = Math.max(0, extracted - alreadyTransferred);
  const totalOutput = returned + jewelry;
  const overLimit = totalOutput > remainingBalance + 0.01; // tiny float tolerance

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!casting || !user) throw new Error('Missing data');
      if (overLimit) throw new Error(`Jewelry + Returned (${totalOutput.toFixed(2)}g) exceeds remaining balance (${remainingBalance.toFixed(2)}g)`);
      const totalAccounted = returned + jewelry + alreadyTransferred;
      const difference = extracted - totalAccounted;
      const tolerance = settings?.default_discrepancy_tolerance_percent ?? 2;
      const discrepancyPercent = extracted > 0 ? (Math.abs(difference) / extracted) * 100 : 0;
      const flag = discrepancyPercent > Number(tolerance);

      const { error } = await supabase.from('casting_records').update({
        returned_button_grams: returned,
        finished_jewelry_grams: jewelry,
        discrepancy_grams: difference,
        discrepancy_percent: discrepancyPercent,
        tolerance_percent_used: Number(tolerance),
        discrepancy_flag: flag,
        status: (flag ? 'flagged' : 'completed') as any,
        completed_by_user_id: user.id,
        completed_at: new Date().toISOString(),
        abnormality_note: abnormalityNote || null,
        remaining_unfinalized_balance_grams: 0,
      }).eq('id', casting.id);
      if (error) throw error;

      // Return sprue/button to inventory (this is actual metal coming back)
      if (returned > 0) {
        const mt = casting.metal_types as any;
        await applyMetalStockDelta(mt.id, returned);

        const { error: txError } = await supabase.from('inventory_transactions').insert({
          metal_type_id: mt.id,
          grams: returned,
          transaction_type: 'return_from_casting',
          entered_by_user_id: user.id,
          notes: `Return from casting ${casting.casting_code}`,
          related_casting_id: casting.id,
        });

        if (txError) {
          await applyMetalStockDelta(mt.id, -returned);
          throw txError;
        }
      }

      // Audit log for completion
      if (alreadyTransferred > 0) {
        await supabase.from('audit_logs').insert({
          action_type: 'casting_completed_with_transfer',
          entity_type: 'casting_record',
          entity_id: casting.id,
          user_id: user.id,
          before_json: { sprue_transferred: alreadyTransferred, extracted: extracted },
          after_json: { finished_jewelry: jewelry, returned_button: returned, discrepancy: difference },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      queryClient.invalidateQueries({ queryKey: ['my_pending'] });
      queryClient.invalidateQueries({ queryKey: ['my_castings'] });
      toast.success('Casting record saved');
      setTimeout(() => navigate('/employee/pending'), 1800);
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!casting) {
    return <div className="p-4"><div className="h-48 bg-muted rounded-lg animate-pulse" /></div>;
  }

  const mt = casting.metal_types as any;
  const cardClass = getMetalCardClass(mt?.color_group ?? '', mt?.metal_family ?? '');
  const emoji = getMetalEmoji(mt?.color_group ?? '', mt?.metal_family ?? '');
  const isFinalized = casting.status === 'completed' || casting.status === 'flagged';

  return (
    <div className="p-4 max-w-lg mx-auto">
      <button
        onClick={() => navigate('/employee/pending')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to pending
      </button>

      {/* Casting info card */}
      <div className={cn('rounded-xl border p-5 mb-6', cardClass)}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">{emoji}</span>
          <span className="font-semibold text-foreground">{mt?.metal_name}</span>
        </div>
        <div className="font-mono text-xs text-muted-foreground mb-2">{casting.casting_code}</div>
        <div className="font-mono text-5xl font-bold text-foreground leading-none">
          {extracted.toFixed(2)}
        </div>
        <div className="text-sm text-muted-foreground mt-1">g total for casting</div>

        {/* Sourcing breakdown */}
        {sourceFromOpenCasting > 0 && (
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              <span>{sourceFromOpenCasting.toFixed(2)}g from open casting</span>
            </div>
            <div className="text-foreground/70">
              {sourceFromInventory.toFixed(2)}g from inventory
            </div>
          </div>
        )}

        {alreadyTransferred > 0 && (
          <div className="mt-2 text-sm font-medium text-foreground/80">
            <ArrowRightLeft className="h-3.5 w-3.5 inline mr-1" />
            {alreadyTransferred.toFixed(2)}g transferred out to other castings
          </div>
        )}
      </div>

      {/* Final Completion */}
      <div className="space-y-5">
        <h3 className="text-base font-semibold text-foreground">Final Completion</h3>

        {/* Remaining balance indicator */}
        {alreadyTransferred > 0 && (
          <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
            <div className="text-sm text-muted-foreground">Remaining after transfers</div>
            <div className="font-mono text-2xl font-bold text-foreground">{remainingBalance.toFixed(2)}g</div>
            <div className="text-xs text-muted-foreground">
              {extracted.toFixed(2)}g extracted − {alreadyTransferred.toFixed(2)}g transferred out
            </div>
          </div>
        )}

        {overLimit && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive font-medium">
            Jewelry ({jewelry.toFixed(2)}g) + Returned ({returned.toFixed(2)}g) = {totalOutput.toFixed(2)}g exceeds remaining balance of {remainingBalance.toFixed(2)}g
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-base font-semibold flex items-center gap-2"><Gem className="h-5 w-5 text-primary" /> Finished Jewelry (g)</Label>
          <Input
            type="number" step="0.01" min="0"
            value={jewelryGrams} onChange={(e) => setJewelryGrams(e.target.value)}
            placeholder="0.00" className="h-14 text-2xl font-mono text-center" inputMode="decimal"
          />
          <p className="text-xs text-muted-foreground">Weight of finished jewelry pieces</p>
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold flex items-center gap-2"><CircleDot className="h-5 w-5 text-amber-600 dark:text-amber-400" /> Returned Sprue / Button (g)</Label>
          <Input
            type="number" step="0.01" min="0"
            value={returnedGrams} onChange={(e) => setReturnedGrams(e.target.value)}
            placeholder="0.00" className="h-14 text-2xl font-mono text-center" inputMode="decimal"
          />
          <p className="text-xs text-muted-foreground">Sprue/button weight to return to inventory</p>
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">Abnormality Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Textarea
            value={abnormalityNote} onChange={(e) => setAbnormalityNote(e.target.value)}
            placeholder="e.g. Sprue broke during removal" className="min-h-[80px]"
          />
        </div>

        <Button
          onClick={() => completeMutation.mutate()}
          disabled={completeMutation.isPending || (returned <= 0 && jewelry <= 0) || isFinalized || overLimit}
          className="w-full h-14 text-base font-semibold" size="lg"
        >
          {completeMutation.isPending ? 'Saving...' : 'Complete Casting'}
        </Button>
      </div>
    </div>
  );
}
