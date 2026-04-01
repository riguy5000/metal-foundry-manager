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
import { getMetalCardClass, getMetalDotClass, generateFlaskCode } from '@/lib/metalUtils';
import { applyMetalStockDelta } from '@/lib/inventoryUtils';
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

  const { data: metal } = useQuery({
    queryKey: ['metal_type', metalId],
    queryFn: async () => {
      const { data, error } = await supabase.from('metal_types').select('*').eq('id', metalId!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!metalId,
  });

  const totalGrams = parseFloat(grams) || 0;
  const available = metal ? Number(metal.current_stock_grams) : 0;
  const remaining = Math.round((available - totalGrams) * 100) / 100;
  const insufficientStock = totalGrams > available + 0.01;

  const extractMutation = useMutation({
    mutationFn: async () => {
      if (!metal || !user) throw new Error('Missing data');
      if (totalGrams <= 0) throw new Error('Enter a valid amount');
      if (insufficientStock) throw new Error('Insufficient inventory stock');

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('casting_records')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());
      const flaskCode = generateFlaskCode((count ?? 0) + 1);

      // All extraction comes from inventory — simple
      const { error: castError } = await supabase.from('casting_records').insert({
        casting_code: flaskCode,
        metal_type_id: metal.id,
        extracted_grams: totalGrams,
        extracted_by_user_id: user.id,
        job_reference: jobReference || null,
        notes: notes || null,
        source_from_inventory_grams: totalGrams,
        source_from_open_casting_grams: 0,
        source_open_casting_id: null,
        remaining_unfinalized_balance_grams: totalGrams,
      } as any);
      if (castError) throw castError;

      // Deduct from stock
      await applyMetalStockDelta(metal.id, -totalGrams);

      const { error: txError } = await supabase.from('inventory_transactions').insert({
        metal_type_id: metal.id,
        grams: totalGrams,
        transaction_type: 'extract_for_casting',
        entered_by_user_id: user.id,
        notes: `Casting ${flaskCode} — ${totalGrams.toFixed(2)}g extracted`,
      });

      if (txError) {
        await applyMetalStockDelta(metal.id, totalGrams);
        throw txError;
      }

      return flaskCode;
    },
    onSuccess: (flaskCode) => {
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      queryClient.invalidateQueries({ queryKey: ['my_castings'] });
      queryClient.invalidateQueries({ queryKey: ['my_pending'] });
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
            {available > 0 && (
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

        {/* Sourcing breakdown */}
        {totalGrams > 0 && (
          <div className="space-y-2">
            <div className={cn(
              'flex items-center justify-between rounded-lg px-3 py-2 text-sm',
              insufficientStock ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
            )}>
              <span>From inventory</span>
              <span className="font-mono font-bold">{insufficientStock ? 'Insufficient stock' : `${totalGrams.toFixed(2)}g`}</span>
            </div>
            {!insufficientStock && (
              <div className="flex items-center justify-between rounded-lg px-3 py-2 text-sm bg-muted text-foreground">
                <span>Remaining inventory</span>
                <span className="font-mono font-bold">{remaining.toFixed(2)}g</span>
              </div>
            )}
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
          disabled={extractMutation.isPending || totalGrams <= 0 || insufficientStock}
          className="w-full h-14 text-base font-semibold" size="lg"
        >
          {extractMutation.isPending ? 'Extracting...' : `Confirm Extraction${totalGrams > 0 ? ` — ${totalGrams.toFixed(2)}g` : ''}`}
        </Button>
      </div>
    </div>
  );
}
