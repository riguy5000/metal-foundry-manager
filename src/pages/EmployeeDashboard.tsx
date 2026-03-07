import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { format } from 'date-fns';

const statusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-800 border-green-200';
    case 'flagged': return 'bg-red-100 text-red-800 border-red-200';
    default: return 'bg-amber-100 text-amber-800 border-amber-200';
  }
};

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [selectedCasting, setSelectedCasting] = useState<any>(null);

  const { data: metals } = useQuery({
    queryKey: ['metal_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('metal_types').select('*').eq('active_status', true).order('display_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: castings } = useQuery({
    queryKey: ['my_castings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('casting_records')
        .select('*, metal_types(metal_name, karat_label)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: settings } = useQuery({
    queryKey: ['settings_emp'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('*').limit(1).maybeSingle();
      return data;
    },
  });

  const createCasting = useMutation({
    mutationFn: async (values: any) => {
      const { error } = await supabase.from('casting_records').insert({
        casting_code: values.castingCode,
        metal_type_id: values.metalId,
        extracted_grams: values.extractedGrams,
        extracted_by_user_id: user!.id,
        job_reference: values.jobReference || null,
        notes: values.notes || null,
      });
      if (error) throw error;

      const metal = metals?.find((m) => m.id === values.metalId);
      if (metal) {
        const newStock = Number(metal.current_stock_grams) - values.extractedGrams;
        if (newStock < 0) throw new Error('Insufficient stock');
        await supabase.from('metal_types').update({ current_stock_grams: newStock }).eq('id', values.metalId);
        await supabase.from('inventory_transactions').insert({
          metal_type_id: values.metalId,
          grams: values.extractedGrams,
          transaction_type: 'extract_for_casting',
          entered_by_user_id: user!.id,
          notes: `Casting ${values.castingCode}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my_castings'] });
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      setNewOpen(false);
      toast.success('Casting created');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const completeCasting = useMutation({
    mutationFn: async (values: any) => {
      const casting = selectedCasting;
      const returnedButton = values.returnedButtonGrams;
      const finishedJewelry = values.finishedJewelryGrams;
      const totalAccounted = returnedButton + finishedJewelry;
      const discrepancyGrams = Number(casting.extracted_grams) - totalAccounted;
      const discrepancyPercent = (discrepancyGrams / Number(casting.extracted_grams)) * 100;
      const tolerance = settings?.default_discrepancy_tolerance_percent ?? 2;
      const flag = Math.abs(discrepancyPercent) > Number(tolerance);

      const { error } = await supabase.from('casting_records').update({
        returned_button_grams: returnedButton,
        finished_jewelry_grams: finishedJewelry,
        discrepancy_grams: discrepancyGrams,
        discrepancy_percent: discrepancyPercent,
        tolerance_percent_used: Number(tolerance),
        discrepancy_flag: flag,
        status: flag ? 'flagged' : 'completed',
        completed_by_user_id: user!.id,
        completed_at: new Date().toISOString(),
        abnormality_note: values.abnormalityNote || null,
      }).eq('id', casting.id);
      if (error) throw error;

      if (returnedButton > 0) {
        const metal = metals?.find((m) => m.id === casting.metal_type_id);
        if (metal) {
          await supabase.from('metal_types').update({
            current_stock_grams: Number(metal.current_stock_grams) + returnedButton,
          }).eq('id', casting.metal_type_id);
          await supabase.from('inventory_transactions').insert({
            metal_type_id: casting.metal_type_id,
            grams: returnedButton,
            transaction_type: 'return_from_casting',
            entered_by_user_id: user!.id,
            notes: `Return from casting ${casting.casting_code}`,
            related_casting_id: casting.id,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my_castings'] });
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      setCompleteOpen(false);
      toast.success('Casting completed');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Castings</h1>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>New Casting</DialogTitle></DialogHeader>
            <NewCastingForm metals={metals ?? []} onSubmit={(v) => createCasting.mutate(v)} loading={createCasting.isPending} />
          </DialogContent>
          <Button onClick={() => setNewOpen(true)}><Plus className="mr-2 h-4 w-4" />New Casting</Button>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Metal</TableHead>
                <TableHead className="text-right">Extracted (g)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {castings?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-medium">{c.casting_code}</TableCell>
                  <TableCell>{(c.metal_types as any)?.metal_name} {(c.metal_types as any)?.karat_label}</TableCell>
                  <TableCell className="text-right font-mono">{Number(c.extracted_grams).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColor(c.status)}>{c.status.replace(/_/g, ' ')}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{format(new Date(c.created_at), 'MMM d')}</TableCell>
                  <TableCell>
                    {c.status === 'extracted_pending_completion' && (
                      <Button size="sm" variant="outline" onClick={() => { setSelectedCasting(c); setCompleteOpen(true); }}>Complete</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Complete — {selectedCasting?.casting_code}</DialogTitle></DialogHeader>
          {selectedCasting && <CompleteCastingForm casting={selectedCasting} onSubmit={(v) => completeCasting.mutate(v)} loading={completeCasting.isPending} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewCastingForm({ metals, onSubmit, loading }: { metals: any[]; onSubmit: (v: any) => void; loading: boolean }) {
  const [castingCode, setCastingCode] = useState('');
  const [metalId, setMetalId] = useState('');
  const [extractedGrams, setExtractedGrams] = useState('');
  const [jobReference, setJobReference] = useState('');
  const [notes, setNotes] = useState('');

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ castingCode, metalId, extractedGrams: parseFloat(extractedGrams), jobReference, notes }); }} className="space-y-4">
      <div className="space-y-2"><Label>Casting Code</Label><Input value={castingCode} onChange={(e) => setCastingCode(e.target.value)} required /></div>
      <div className="space-y-2">
        <Label>Metal</Label>
        <Select value={metalId} onValueChange={setMetalId}>
          <SelectTrigger><SelectValue placeholder="Select metal" /></SelectTrigger>
          <SelectContent>{metals.map((m) => <SelectItem key={m.id} value={m.id}>{m.metal_name} {m.karat_label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-2"><Label>Extracted Grams</Label><Input type="number" step="0.01" min="0.01" value={extractedGrams} onChange={(e) => setExtractedGrams(e.target.value)} required /></div>
      <div className="space-y-2"><Label>Job Reference</Label><Input value={jobReference} onChange={(e) => setJobReference(e.target.value)} /></div>
      <div className="space-y-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <Button type="submit" className="w-full" disabled={loading || !metalId}>{loading ? 'Creating...' : 'Create'}</Button>
    </form>
  );
}

function CompleteCastingForm({ casting, onSubmit, loading }: { casting: any; onSubmit: (v: any) => void; loading: boolean }) {
  const [returnedButtonGrams, setReturnedButtonGrams] = useState('');
  const [finishedJewelryGrams, setFinishedJewelryGrams] = useState('');
  const [abnormalityNote, setAbnormalityNote] = useState('');
  const returned = parseFloat(returnedButtonGrams) || 0;
  const jewelry = parseFloat(finishedJewelryGrams) || 0;
  const extracted = Number(casting.extracted_grams);
  const discrepancy = extracted - (returned + jewelry);
  const pct = extracted > 0 ? (discrepancy / extracted) * 100 : 0;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ returnedButtonGrams: returned, finishedJewelryGrams: jewelry, abnormalityNote }); }} className="space-y-4">
      <div className="rounded-lg bg-muted p-3 text-sm">Extracted: <strong>{extracted.toFixed(2)}g</strong></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Returned Button (g)</Label><Input type="number" step="0.01" min="0" value={returnedButtonGrams} onChange={(e) => setReturnedButtonGrams(e.target.value)} required /></div>
        <div className="space-y-2"><Label>Finished Jewelry (g)</Label><Input type="number" step="0.01" min="0" value={finishedJewelryGrams} onChange={(e) => setFinishedJewelryGrams(e.target.value)} required /></div>
      </div>
      {(returned > 0 || jewelry > 0) && (
        <div className={`rounded-lg p-3 text-sm ${Math.abs(pct) > 2 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          Discrepancy: {discrepancy.toFixed(2)}g ({pct.toFixed(2)}%){Math.abs(pct) > 2 && ' ⚠️'}
        </div>
      )}
      <div className="space-y-2"><Label>Abnormality Note</Label><Textarea value={abnormalityNote} onChange={(e) => setAbnormalityNote(e.target.value)} /></div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Completing...' : 'Complete'}</Button>
    </form>
  );
}
