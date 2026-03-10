import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useState, useMemo } from 'react';
import { ArrowLeft, CheckCircle2, ArrowRightLeft } from 'lucide-react';
import { getMetalCardClass, getMetalDotClass, generateFlaskCode } from '@/lib/metalUtils';
import { cn } from '@/lib/utils';

export default function EmployeeExtract() {
  const { metalId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [grams, setGrams] = useState('');
  const [jobReference, setJobReference] = useState('');
  const [notes, setNotes] = useState('');
  const [success, setSuccess] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');

  // Open casting sourcing state
  const [sourceOpenCastingId, setSourceOpenCastingId] = useState<string>('');
  const [openCastingGrams, setOpenCastingGrams] = useState('');

  const { data: metal } = useQuery({
    queryKey: ['metal_type', metalId],
    queryFn: async () => {
      const { data, error } = await supabase.from('metal_types').select('*').eq('id', metalId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!metalId,
  });

  // Fetch open castings for this metal type that have available balance
  const { data: openCastings } = useQuery({
    queryKey: ['open_castings', metalId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('casting_records')
        .select('id, casting_code, extracted_grams, sprue_transferred_to_next_casting_grams, remaining_unfinalized_balance_grams, finished_jewelry_grams, returned_button_grams')
        .eq('metal_type_id', metalId!)
        .in('status', ['extracted_pending_completion', 'open_with_sprue_transfer'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Calculate available balance for each
      return (data ?? []).map((c: any) => {
        const remaining = c.remaining_unfinalized_balance_grams != null
          ? Number(c.remaining_unfinalized_balance_grams)
          : Number(c.extracted_grams) - Number(c.sprue_transferred_to_next_casting_grams ?? 0) - Number(c.finished_jewelry_grams ?? 0) - Number(c.returned_button_grams ?? 0);
        return { ...c, availableBalance: Math.round(remaining * 100) / 100 };
      }).filter((c: any) => c.availableBalance > 0);
    },
    enabled: !!metalId,
  });

  const totalGrams = parseFloat(grams) || 0;
  const fromOpenCasting = parseFloat(openCastingGrams) || 0;
  const fromInventory = Math.round((totalGrams - fromOpenCasting) * 100) / 100;
  const available = metal ? Number(metal.current_stock_grams) : 0;
  const remainingInventory = Math.round((available - fromInventory) * 100) / 100;
  const selectedOpenCasting = openCastings?.find((c: any) => c.id === sourceOpenCastingId);
  const maxFromOpenCasting = selectedOpenCasting ? selectedOpenCasting.availableBalance : 0;

  const validationError = useMemo(() => {
    if (totalGrams <= 0) return null;
    if (fromOpenCasting > maxFromOpenCasting) return `Cannot take more than ${maxFromOpenCasting.toFixed(2)}g from selected casting`;
    if (fromOpenCasting > totalGrams) return 'Open casting source exceeds total';
    if (fromInventory < 0) return 'Open casting source exceeds total grams needed';
    if (fromInventory > available) return 'Insufficient inventory stock';
    return null;
  }, [totalGrams, fromOpenCasting, maxFromOpenCasting, fromInventory, available]);

  const extractMutation = useMutation({
    mutationFn: async () => {
      if (!metal || !user) throw new Error('Missing data');
      if (validationError) throw new Error(validationError);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('casting_records')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());
      const flaskCode = generateFlaskCode((count ?? 0) + 1);

      // Create casting record with sourcing breakdown
      const { error: castError } = await supabase.from('casting_records').insert({
        casting_code: flaskCode,
        metal_type_id: metal.id,
        extracted_grams: totalGrams,
        extracted_by_user_id: user.id,
        job_reference: jobReference || null,
        notes: notes || null,
        source_from_inventory_grams: fromInventory,
        source_from_open_casting_grams: fromOpenCasting,
        source_open_casting_id: sourceOpenCastingId || null,
        remaining_unfinalized_balance_grams: totalGrams,
      } as any);
      if (castError) throw castError;

      // Only subtract the inventory-sourced portion from stock
      if (fromInventory > 0) {
        const newStock = Math.round((available - fromInventory) * 100) / 100;
        const { error: stockError } = await supabase
          .from('metal_types')
          .update({ current_stock_grams: newStock })
          .eq('id', metal.id);
        if (stockError) throw stockError;

        const { error: txError } = await supabase.from('inventory_transactions').insert({
          metal_type_id: metal.id,
          grams: fromInventory,
          transaction_type: 'extract_for_casting',
          entered_by_user_id: user.id,
          notes: `Casting ${flaskCode} (${fromInventory.toFixed(2)}g from inventory${fromOpenCasting > 0 ? `, ${fromOpenCasting.toFixed(2)}g from open casting` : ''})`,
        });
        if (txError) throw txError;
      }

      // If sourcing from an open casting, update that casting's transferred-out tracking
      if (sourceOpenCastingId && fromOpenCasting > 0) {
        const sourceCasting = selectedOpenCasting;
        if (sourceCasting) {
          const currentTransferred = Number((sourceCasting as any).sprue_transferred_to_next_casting_grams ?? 0);
          const newTransferred = currentTransferred + fromOpenCasting;
          const newRemaining = Number(sourceCasting.availableBalance) - fromOpenCasting;

          const { error: updateErr } = await supabase.from('casting_records').update({
            sprue_transferred_to_next_casting_grams: newTransferred,
            remaining_unfinalized_balance_grams: Math.round(newRemaining * 100) / 100,
            has_sprue_transfer: true,
            last_sprue_transfer_at: new Date().toISOString(),
            status: 'open_with_sprue_transfer' as any,
          }).eq('id', sourceOpenCastingId);
          if (updateErr) throw updateErr;

          // Audit log for the transfer
          await supabase.from('audit_logs').insert({
            action_type: 'sprue_transfer_at_extraction',
            entity_type: 'casting_record',
            entity_id: sourceOpenCastingId,
            user_id: user.id,
            before_json: { sprue_transferred: currentTransferred },
            after_json: { sprue_transferred: newTransferred, transfer_amount: fromOpenCasting, destination_casting: flaskCode },
          });
        }
      }

      return flaskCode;
    },
    onSuccess: (flaskCode) => {
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      queryClient.invalidateQueries({ queryKey: ['my_castings'] });
      queryClient.invalidateQueries({ queryKey: ['my_pending'] });
      queryClient.invalidateQueries({ queryKey: ['open_castings'] });
      setGeneratedCode(flaskCode);
      setSuccess(true);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Success screen
  if (success && metal) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[60vh]">
        <div className="rounded-full bg-success/10 p-4 mb-4">
          <CheckCircle2 className="h-12 w-12 text-success" />
        </div>
        <h2 className="text-xl font-bold mb-2">Extraction Complete</h2>
        <div className="rounded-lg bg-muted px-5 py-3 mb-2">
          <div className="text-xs text-muted-foreground mb-0.5">Flask Code</div>
          <div className="font-mono text-2xl font-bold">{generatedCode}</div>
        </div>
        <p className="text-muted-foreground mb-1">
          {totalGrams.toFixed(2)}g of {metal.metal_name}
        </p>
        {fromOpenCasting > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-1">
            {fromOpenCasting.toFixed(2)}g from open casting · {fromInventory.toFixed(2)}g from inventory
          </p>
        )}
        <div className="flex gap-3 mt-4">
          <Button variant="outline" onClick={() => navigate('/employee')}>Back to Metals</Button>
          <Button onClick={() => navigate('/employee/pending')}>View Pending</Button>
        </div>
      </div>
    );
  }

  if (!metal) {
    return <div className="p-4"><div className="h-48 bg-muted rounded-lg animate-pulse" /></div>;
  }

  const cardClass = getMetalCardClass(metal.color_group, metal.metal_family);
  const dotClass = getMetalDotClass(metal.color_group, metal.metal_family);
  const hasOpenCastings = (openCastings ?? []).length > 0;

  return (
    <div className="p-4 max-w-lg mx-auto">
      <button
        onClick={() => navigate('/employee')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Metals
      </button>

      {/* Metal info */}
      <div className={cn('rounded-xl p-5 mb-6', cardClass)}>
        <div className="flex items-center gap-2 mb-1">
          <div className={cn('h-3 w-3 rounded-full', dotClass)} />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{metal.karat_label}</span>
        </div>
        <h2 className="text-lg font-bold mb-3">{metal.metal_name}</h2>
        <div className="flex items-baseline gap-1">
          <span className="font-mono text-3xl font-bold">{available.toFixed(2)}</span>
          <span className="text-sm text-muted-foreground">grams in inventory</span>
        </div>
      </div>

      {/* Form */}
      <div className="space-y-5">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Total Grams for Casting</Label>
          <div className="flex gap-3">
            <Input
              type="number" step="0.01" min="0.01"
              value={grams} onChange={(e) => setGrams(e.target.value)}
              placeholder="0.00"
              className="h-14 text-2xl font-mono text-center flex-1 min-w-0"
              inputMode="decimal"
            />
            {!hasOpenCastings && available > 0 && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setGrams(available.toString())}
                className="h-14 flex-1 min-w-0 flex flex-col items-center justify-center gap-0 px-3"
              >
                <span className="text-xs font-medium text-muted-foreground leading-tight">Take All</span>
                <span className="font-mono text-base font-bold leading-tight">{available.toFixed(2)}g</span>
              </Button>
            )}
          </div>
        </div>

        {/* Open Casting Sourcing */}
        {hasOpenCastings && totalGrams > 0 && (
          <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <ArrowRightLeft className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">Source from Open Casting</h3>
              <span className="text-[10px] text-muted-foreground ml-auto">(optional)</span>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-amber-800 dark:text-amber-300">Select open casting</Label>
              <Select value={sourceOpenCastingId} onValueChange={(v) => { setSourceOpenCastingId(v === 'none' ? '' : v); if (v === 'none') setOpenCastingGrams(''); }}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="None — all from inventory" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None — all from inventory</SelectItem>
                  {openCastings?.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.casting_code} — {c.availableBalance.toFixed(2)}g available
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {sourceOpenCastingId && (
              <div className="space-y-2">
                <Label className="text-xs text-amber-800 dark:text-amber-300">
                  Grams from {selectedOpenCasting?.casting_code} (max {maxFromOpenCasting.toFixed(2)}g)
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="number" step="0.01" min="0"
                    max={maxFromOpenCasting}
                    value={openCastingGrams}
                    onChange={(e) => setOpenCastingGrams(e.target.value)}
                    placeholder="0.00"
                    className="h-10 text-base font-mono text-center flex-1"
                    inputMode="decimal"
                  />
                  <Button
                    type="button" variant="outline" size="sm"
                    className="h-10 px-3 text-xs border-amber-500/50 text-amber-700 dark:text-amber-300"
                    onClick={() => setOpenCastingGrams(Math.min(maxFromOpenCasting, totalGrams).toFixed(2))}
                  >
                    Max
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sourcing breakdown */}
        {totalGrams > 0 && (
          <div className="space-y-2">
            {fromOpenCasting > 0 && (
              <div className="flex items-center justify-between rounded-lg px-3 py-2 text-sm bg-amber-100/50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300">
                <span>From open casting</span>
                <span className="font-mono font-bold">{fromOpenCasting.toFixed(2)}g</span>
              </div>
            )}
            <div className={cn(
              'flex items-center justify-between rounded-lg px-3 py-2 text-sm',
              validationError ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
            )}>
              <span>From inventory</span>
              <span className="font-mono font-bold">{validationError ? 'Error' : `${fromInventory.toFixed(2)}g`}</span>
            </div>
            <div className={cn(
              'flex items-center justify-between rounded-lg px-3 py-2 text-sm',
              validationError ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground'
            )}>
              <span>Remaining inventory</span>
              <span className="font-mono font-bold">{validationError ? validationError : `${remainingInventory.toFixed(2)}g`}</span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-sm font-medium">Job Reference <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input value={jobReference} onChange={(e) => setJobReference(e.target.value)} placeholder="e.g. WO-1234" className="h-12" />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes about this extraction" className="min-h-[80px]" />
        </div>

        <Button
          onClick={() => extractMutation.mutate()}
          disabled={extractMutation.isPending || totalGrams <= 0 || !!validationError}
          className="w-full h-14 text-base font-semibold" size="lg"
        >
          {extractMutation.isPending ? 'Extracting...' : `Confirm Extraction${totalGrams > 0 ? ` — ${totalGrams.toFixed(2)}g` : ''}`}
        </Button>
      </div>
    </div>
  );
}
