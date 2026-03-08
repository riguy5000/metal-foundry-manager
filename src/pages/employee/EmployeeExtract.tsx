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

  const extractGrams = parseFloat(grams) || 0;
  const available = metal ? Number(metal.current_stock_grams) : 0;
  const remaining = Math.round((available - extractGrams) * 100) / 100;
  const insufficientStock = remaining < 0;

  const extractMutation = useMutation({
    mutationFn: async () => {
      if (!metal || !user) throw new Error('Missing data');
      if (insufficientStock) throw new Error('Insufficient stock');

      // Get today's count for sequence at save time
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('casting_records')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());
      const flaskCode = generateFlaskCode((count ?? 0) + 1);

      const { error: castError } = await supabase.from('casting_records').insert({
        casting_code: flaskCode,
        metal_type_id: metal.id,
        extracted_grams: extractGrams,
        extracted_by_user_id: user.id,
        job_reference: jobReference || null,
        notes: notes || null,
      });
      if (castError) throw castError;

      const { error: stockError } = await supabase
        .from('metal_types')
        .update({ current_stock_grams: remaining })
        .eq('id', metal.id);
      if (stockError) throw stockError;

      const { error: txError } = await supabase.from('inventory_transactions').insert({
        metal_type_id: metal.id,
        grams: extractGrams,
        transaction_type: 'extract_for_casting',
        entered_by_user_id: user.id,
        notes: `Casting ${flaskCode}`,
      });
      if (txError) throw txError;

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

  // Success screen — show the auto-generated code
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
        <p className="text-muted-foreground mb-6">
          {extractGrams.toFixed(2)}g of {metal.metal_name} extracted
        </p>
        <div className="flex gap-3">
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
          <span className="font-mono text-3xl font-bold">{available.toFixed(1)}</span>
          <span className="text-sm text-muted-foreground">grams available</span>
        </div>
      </div>

      {/* Form — no flask code input, auto-generated on save */}
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex gap-2">
            <Label className="text-sm font-medium flex-1">Grams to Extract</Label>
            {available > 0 && (
              <button
                type="button"
                onClick={() => setGrams(available.toString())}
                className="text-xs font-medium text-primary hover:underline"
              >
                Take All ({available.toFixed(2)}g)
              </button>
            )}
          </div>
          <Input
            type="number" step="0.01" min="0.01"
            value={grams} onChange={(e) => setGrams(e.target.value)}
            placeholder="0.00"
            className="h-14 text-2xl font-mono text-center"
            inputMode="decimal"
          />
          {extractGrams > 0 && (
            <div className={cn(
              'flex items-center justify-between rounded-lg px-3 py-2 text-sm',
              insufficientStock ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success'
            )}>
              <span>Remaining after extraction</span>
              <span className="font-mono font-bold">{insufficientStock ? 'Insufficient' : `${remaining.toFixed(2)}g`}</span>
            </div>
          )}
        </div>

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
          disabled={extractMutation.isPending || extractGrams <= 0 || insufficientStock}
          className="w-full h-14 text-base font-semibold" size="lg"
        >
          {extractMutation.isPending ? 'Extracting...' : `Confirm Extraction${extractGrams > 0 ? ` — ${extractGrams.toFixed(2)}g` : ''}`}
        </Button>
      </div>
    </div>
  );
}
