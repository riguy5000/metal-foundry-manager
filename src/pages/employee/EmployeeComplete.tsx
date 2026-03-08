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
import { ArrowLeft } from 'lucide-react';
import { getMetalCardClass, getMetalEmoji } from '@/lib/metalUtils';
import { cn } from '@/lib/utils';

export default function EmployeeComplete() {
  const { castingId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [returnedGrams, setReturnedGrams] = useState('');
  const [jewelryGrams, setJewelryGrams] = useState('');
  const [abnormalityNote, setAbnormalityNote] = useState('');
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

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!casting || !user) throw new Error('Missing data');
      const totalAccounted = returned + jewelry;
      const difference = extracted - totalAccounted;
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
      toast.success('Casting record saved');
      setTimeout(() => navigate(-1 as any), 1800);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Neutral success — no discrepancy info shown
  if (success) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[60vh]">
        <div className="rounded-full bg-success/10 p-4 mb-4">
          <CheckCircle2 className="h-12 w-12 text-success" />
        </div>
        <h2 className="text-xl font-bold mb-1">Casting Record Saved</h2>
        <p className="text-muted-foreground mb-6">
          {casting?.casting_code} — record saved successfully
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate('/employee')}>Back to Metals</Button>
          <Button onClick={() => navigate('/employee/pending')}>View Pending</Button>
        </div>
      </div>
    );
  }

  if (!casting) {
    return <div className="p-4"><div className="h-48 bg-muted rounded-lg animate-pulse" /></div>;
  }

  const mt = casting.metal_types as any;
  const cardClass = getMetalCardClass(mt?.color_group ?? '', mt?.metal_family ?? '');
  const emoji = getMetalEmoji(mt?.color_group ?? '', mt?.metal_family ?? '');

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
      </div>

      {/* Simple form — no reconciliation preview, no discrepancy info */}
      <div className="space-y-5">
        <div className="space-y-2">
          <Label className="text-base font-semibold">Finished Jewelry (g)</Label>
          <Input
            type="number" step="0.01" min="0"
            value={jewelryGrams} onChange={(e) => setJewelryGrams(e.target.value)}
            placeholder="0.00" className="h-14 text-2xl font-mono text-center" inputMode="decimal"
          />
          <p className="text-xs text-muted-foreground">Weight of finished jewelry pieces</p>
        </div>

        <div className="space-y-2">
          <Label className="text-base font-semibold">Returned Sprue / Button (g)</Label>
          <Input
            type="number" step="0.01" min="0"
            value={returnedGrams} onChange={(e) => setReturnedGrams(e.target.value)}
            placeholder="0.00" className="h-14 text-2xl font-mono text-center" inputMode="decimal"
          />
          <p className="text-xs text-muted-foreground">Sprue/button weight to return</p>
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
          disabled={completeMutation.isPending || (returned <= 0 && jewelry <= 0)}
          className="w-full h-14 text-base font-semibold" size="lg"
        >
          {completeMutation.isPending ? 'Saving...' : 'Complete Casting'}
        </Button>
      </div>
    </div>
  );
}
