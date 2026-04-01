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
import { ArrowLeft, Gem, CircleDot, ArrowRightLeft } from 'lucide-react';
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

  // Transfer state
  const [transferGrams, setTransferGrams] = useState('');
  const [transferNote, setTransferNote] = useState('');

  const { data: casting, refetch: refetchCasting } = useQuery({
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
  const remainingBalance = Math.max(0, extracted - alreadyTransferred);
  const totalOutput = returned + jewelry;
  const overLimit = totalOutput > remainingBalance + 0.01;

  const transferAmount = parseFloat(transferGrams) || 0;
  const maxTransferable = remainingBalance;
  const transferInvalid = transferAmount <= 0 || transferAmount > maxTransferable + 0.01;

  // Transfer mutation — moves metal from open casting back to stock
  const transferMutation = useMutation({
    mutationFn: async () => {
      if (!casting || !user) throw new Error('Missing data');
      if (transferAmount <= 0) throw new Error('Enter a valid amount');
      if (transferAmount > maxTransferable + 0.01) throw new Error(`Cannot transfer more than ${maxTransferable.toFixed(2)}g`);

      const isFinalized = casting.status === 'completed' || casting.status === 'flagged';
      if (isFinalized) throw new Error('Cannot transfer from a finalized casting');

      const mt = casting.metal_types as any;
      const newTransferred = Math.round((alreadyTransferred + transferAmount) * 100) / 100;
      const newRemaining = Math.round((extracted - newTransferred) * 100) / 100;

      // Add to inventory
      await applyMetalStockDelta(mt.id, transferAmount);

      // Log inventory transaction
      const { error: txError } = await supabase.from('inventory_transactions').insert({
        metal_type_id: mt.id,
        grams: transferAmount,
        transaction_type: 'transfer_from_open_casting_to_stock' as any,
        entered_by_user_id: user.id,
        notes: transferNote || `Transfer from casting ${casting.casting_code}`,
        related_casting_id: casting.id,
      });

      if (txError) {
        await applyMetalStockDelta(mt.id, -transferAmount);
        throw txError;
      }

      // Update casting record
      const { error: updateErr } = await supabase.from('casting_records').update({
        sprue_transferred_to_next_casting_grams: newTransferred,
        remaining_unfinalized_balance_grams: newRemaining,
        has_sprue_transfer: true,
        last_sprue_transfer_at: new Date().toISOString(),
        sprue_transfer_notes: transferNote || null,
        status: 'open_with_sprue_transfer' as any,
      }).eq('id', casting.id);

      if (updateErr) {
        // Rollback inventory
        await applyMetalStockDelta(mt.id, -transferAmount);
        throw updateErr;
      }

      // Audit
      await supabase.from('audit_logs').insert({
        action_type: 'transfer_to_stock',
        entity_type: 'casting_record',
        entity_id: casting.id,
        user_id: user.id,
        before_json: { transferred_to_stock: alreadyTransferred },
        after_json: { transferred_to_stock: newTransferred, transfer_amount: transferAmount },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      queryClient.invalidateQueries({ queryKey: ['my_pending'] });
      queryClient.invalidateQueries({ queryKey: ['casting_record', castingId] });
      setTransferGrams('');
      setTransferNote('');
      toast.success('Transfer saved — metal returned to stock');
    },
    onError: (e: any) => toast.error(e.message),
  });

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

      // Return sprue/button to inventory
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      queryClient.invalidateQueries({ queryKey: ['my_pending'] });
      queryClient.invalidateQueries({ queryKey: ['my_castings'] });
      toast.success('Casting completed');
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
  const isPending = !isFinalized;

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
        <div className="text-sm text-muted-foreground mt-1">g extracted</div>

        {alreadyTransferred > 0 && (
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              <span>{alreadyTransferred.toFixed(2)}g transferred back to stock</span>
            </div>
            <div className="font-semibold text-foreground">
              Remaining: {remainingBalance.toFixed(2)}g
            </div>
          </div>
        )}
      </div>

      {/* ── TRANSFER SECTION ── visually distinct panel */}
      {isPending && (
        <div className="rounded-xl border-2 border-dashed border-sky-500/50 bg-sky-50/60 dark:bg-sky-950/30 p-5 mb-6 space-y-4">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            <h3 className="text-base font-semibold text-sky-800 dark:text-sky-300">Transfer Metal to Next Casting</h3>
          </div>
          <p className="text-xs text-sky-700 dark:text-sky-400/80">
            Use this to move clean sprue/spool from this open casting back into stock for the next casting before final cleanup.
          </p>

          {maxTransferable > 0 ? (
            <>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-sky-900 dark:text-sky-200">Transfer Amount (g)</Label>
                <Input
                  type="number" step="0.01" min="0.01"
                  max={maxTransferable}
                  value={transferGrams}
                  onChange={(e) => setTransferGrams(e.target.value)}
                  placeholder="0.00"
                  className="h-12 text-xl font-mono text-center"
                  inputMode="decimal"
                />
                <p className="text-xs text-sky-700 dark:text-sky-400/80">
                  Max transferable: <strong className="font-mono">{maxTransferable.toFixed(2)}g</strong>
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-sky-900 dark:text-sky-200">Note <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea
                  value={transferNote}
                  onChange={(e) => setTransferNote(e.target.value)}
                  placeholder="e.g. Clean sprue cut for next flask"
                  className="min-h-[60px]"
                />
              </div>

              {transferAmount > maxTransferable + 0.01 && (
                <div className="rounded-lg p-2 text-xs bg-destructive/10 text-destructive">
                  Exceeds remaining balance of {maxTransferable.toFixed(2)}g
                </div>
              )}

              <Button
                onClick={() => transferMutation.mutate()}
                disabled={transferMutation.isPending || transferInvalid}
                variant="outline"
                className="w-full h-12 text-sm font-semibold border-sky-500/50 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40"
              >
                {transferMutation.isPending ? 'Transferring...' : `Apply Transfer${transferAmount > 0 ? ` — ${transferAmount.toFixed(2)}g` : ''}`}
              </Button>
            </>
          ) : (
            <p className="text-sm text-sky-700/60 dark:text-sky-400/50">No remaining balance to transfer.</p>
          )}
        </div>
      )}

      {/* ── FINAL COMPLETION ── */}
      <div className="space-y-5">
        <h3 className="text-base font-semibold text-foreground">Final Completion</h3>

        {alreadyTransferred > 0 && (
          <div className="rounded-lg border border-border bg-muted/50 p-3 space-y-1">
            <div className="text-sm text-muted-foreground">Remaining after transfers</div>
            <div className="font-mono text-2xl font-bold text-foreground">{remainingBalance.toFixed(2)}g</div>
            <div className="text-xs text-muted-foreground">
              {extracted.toFixed(2)}g extracted − {alreadyTransferred.toFixed(2)}g transferred to stock
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
