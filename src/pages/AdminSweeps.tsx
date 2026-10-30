import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSweepsCredits } from '@/hooks/useSweeps';
import { allocateSweeps, isSweepsFamilyMatch, reconcileSweeps } from '@/lib/sweepsUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Ban } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function AdminSweeps() {
  const client = useQueryClient();
  const sweeps = useSweepsCredits();
  const [family, setFamily] = useState('Gold');
  const [date, setDate] = useState('');
  const [receivedOn, setReceivedOn] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [grams, setGrams] = useState('');
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [voidId, setVoidId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const castings = useQuery({ queryKey: ['sweeps_castings'], queryFn: async () => {
    const { data, error } = await supabase.from('casting_records')
      .select('*, metal_types(metal_name, metal_family)')
      .in('status', ['completed', 'flagged']).order('extracted_at', { ascending: false });
    if (error) throw error;
    return data;
  } });
  const eligible = (castings.data ?? []).filter(c => isSweepsFamilyMatch(c.metal_types?.metal_family, family)
    && (!date || format(new Date(c.extracted_at), 'yyyy-MM-dd') === date));
  const chosen = eligible.filter(c => selected.includes(c.id));
  const amount = Number(grams);
  const preview = allocateSweeps(chosen.map(c => ({ id: c.id, grams: reconcileSweeps(c, sweeps.credits[c.id]).remaining })), Number.isFinite(amount) ? amount : 0);
  const totalLoss = chosen.reduce((sum, c) => sum + Math.max(0, reconcileSweeps(c, sweeps.credits[c.id]).remaining), 0);
  const invalidate = () => {
    client.invalidateQueries({ queryKey: ['sweeps'] });
    client.invalidateQueries({ queryKey: ['sweeps_castings'] });
  };
  const save = useMutation({ mutationFn: async () => {
    const { error } = await supabase.rpc('record_sweeps_receipt', {
      p_family: family, p_grams: amount, p_received_on: receivedOn,
      p_casting_ids: chosen.map(c => c.id), p_notes: notes,
    });
    if (error) throw error;
  }, onSuccess: () => { invalidate(); setGrams(''); setNotes(''); setSelected([]); toast.success('Sweeps receipt saved'); },
  onError: (e: Error) => toast.error(e.message) });
  const voidReceipt = useMutation({ mutationFn: async () => {
    if (!voidId) throw new Error('Select a receipt');
    const { error } = await supabase.rpc('void_sweeps_receipt', { p_receipt_id: voidId, p_reason: reason });
    if (error) throw error;
  }, onSuccess: () => { invalidate(); setVoidId(null); setReason(''); toast.success('Receipt voided; loss credits removed'); },
  onError: (e: Error) => toast.error(e.message) });
  const receipts = sweeps.data ?? [];
  const pages = Math.max(1, Math.ceil(receipts.length / 25));
  const safePage = Math.min(page, pages);
  return <div className="space-y-6">
    <h1 className="text-2xl font-bold">Sweeps</h1>
    {(sweeps.error || castings.error) && <p role="alert" className="text-destructive">Could not load sweeps or castings. <Button variant="outline" onClick={() => { sweeps.refetch(); castings.refetch(); }}>Retry</Button></p>}
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
      <h2 className="text-lg font-semibold">Receive a bag</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2"><Label htmlFor="sweeps-family">Metal family</Label>
          <Select value={family} onValueChange={v => { setFamily(v); setSelected([]); }}><SelectTrigger id="sweeps-family"><SelectValue /></SelectTrigger><SelectContent>
            {['Gold', 'Silver', 'Platinum', 'Palladium'].map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="sweeps-date">Casting date (optional)</Label><Input id="sweeps-date" type="date" value={date} onChange={e => { setDate(e.target.value); setSelected([]); }} /></div>
        <div className="space-y-2"><Label htmlFor="sweeps-received">Received on</Label><Input id="sweeps-received" type="date" value={receivedOn} onChange={e => setReceivedOn(e.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="sweeps-weight">Bag weight (g)</Label><Input id="sweeps-weight" type="number" min="0.01" step="0.01" value={grams} onChange={e => setGrams(e.target.value)} placeholder="0.00" required /></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">Castings covered by this bag</h3>
        <Button type="button" variant="outline" size="sm" onClick={() => setSelected(eligible.filter(c => reconcileSweeps(c, sweeps.credits[c.id]).remaining > 0).map(c => c.id))}>Select all with remaining loss</Button></div>
      <div className="max-h-96 overflow-auto border border-border rounded-lg">
        <Table><TableHeader><TableRow><TableHead>Select</TableHead><TableHead>Date / Code</TableHead><TableHead>Metal</TableHead><TableHead className="text-right">Casting Wt</TableHead><TableHead className="text-right">Original loss (g)</TableHead><TableHead className="text-right">Sweeps (g)</TableHead><TableHead className="text-right">Remaining (g)</TableHead><TableHead className="text-right">This bag (g)</TableHead></TableRow></TableHeader><TableBody>
          {eligible.map(c => { const loss = reconcileSweeps(c, sweeps.credits[c.id]); return <TableRow key={c.id}>
            <TableCell><Checkbox aria-label={`Include ${c.casting_code}`} checked={selected.includes(c.id)} disabled={loss.remaining <= 0 || sweeps.isPending} onCheckedChange={v => setSelected(s => v ? [...s, c.id] : s.filter(id => id !== c.id))} /></TableCell>
            <TableCell><div className="text-xs text-muted-foreground">{format(new Date(c.extracted_at), 'M/d/yyyy')}</div><span className="font-mono text-xs">{c.casting_code}</span></TableCell>
            <TableCell>{c.metal_types?.metal_name}</TableCell><TableCell className="text-right font-mono">{Number(c.extracted_grams).toFixed(2)}</TableCell><TableCell className="text-right font-mono">{loss.original.toFixed(2)}</TableCell><TableCell className="text-right font-mono">{loss.credited.toFixed(2)}</TableCell><TableCell className="text-right font-mono">{loss.remaining.toFixed(2)}</TableCell><TableCell className="text-right font-mono">{(preview.allocations.find(a => a.id === c.id)?.grams ?? 0).toFixed(2)}</TableCell>
          </TableRow>; })}
          {eligible.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">{castings.isPending ? 'Loading castings…' : 'No finalized castings for this selection'}</TableCell></TableRow>}
        </TableBody></Table></div>
      <div className="flex flex-wrap gap-6 border-y border-border py-3 text-sm">
        <span>Selected loss: <strong className="font-mono">{totalLoss.toFixed(2)}g</strong></span>
        <span>After this bag: <strong className="font-mono">{Math.max(0, totalLoss - Math.max(0, amount || 0)).toFixed(2)}g</strong></span>
        <span>Unallocated sweeps: <strong className="font-mono">{preview.excess.toFixed(2)}g</strong></span>
        <Badge variant="outline">Sweeps held separately · no stock change</Badge>
      </div>
      <div className="space-y-2"><Label htmlFor="sweeps-notes">Notes (optional)</Label><Textarea id="sweeps-notes" value={notes} onChange={e => setNotes(e.target.value)} /></div>
      <Button disabled={save.isPending || sweeps.isPending || !!sweeps.error || !!castings.error || chosen.length === 0 || totalLoss <= 0 || !Number.isFinite(amount) || amount <= 0}><Plus className="h-4 w-4 mr-2" />{save.isPending ? 'Saving…' : 'Save Sweeps Receipt'}</Button>
    </form>
    <section className="space-y-3 border-t border-border pt-6"><h2 className="text-lg font-semibold">Receipt history</h2>
      <Table><TableHeader><TableRow><TableHead>Received</TableHead><TableHead>Family</TableHead><TableHead className="text-right">Bag (g)</TableHead><TableHead className="text-right">Credited (g)</TableHead><TableHead className="text-right">Unallocated (g)</TableHead><TableHead>Castings / credited grams</TableHead><TableHead>Notes</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader><TableBody>
        {receipts.slice((safePage - 1) * 25, safePage * 25).map(r => { const allocated = r.sweeps_allocations.reduce((sum, a) => sum + Number(a.grams), 0); return <TableRow key={r.id}>
          <TableCell>{format(new Date(r.received_on + 'T12:00:00'), 'M/d/yyyy')}</TableCell><TableCell>{r.metal_family}</TableCell><TableCell className="text-right font-mono">{Number(r.grams).toFixed(2)}</TableCell><TableCell className="text-right font-mono">{r.voided_at ? '0.00' : allocated.toFixed(2)}</TableCell><TableCell className="text-right font-mono">{(Number(r.grams) - allocated).toFixed(2)}</TableCell>
          <TableCell className="text-xs font-mono">{r.sweeps_allocations.map(a => <div key={a.casting_id}>{a.casting_records?.casting_code} · {Number(a.grams).toFixed(2)}g</div>)}</TableCell><TableCell className="max-w-48 break-words text-sm">{r.voided_at ? r.void_reason : r.notes || '—'}</TableCell><TableCell><Badge variant="outline">{r.voided_at ? 'Voided' : 'Recorded'}</Badge></TableCell><TableCell>{!r.voided_at && <Button variant="ghost" size="icon" aria-label={`Void ${r.metal_family} receipt ${r.received_on}`} onClick={() => { setVoidId(r.id); setReason(''); }}><Ban className="h-4 w-4" /></Button>}</TableCell>
        </TableRow>; })}
        {!receipts.length && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">{sweeps.isPending ? 'Loading receipts…' : 'No sweeps receipts yet'}</TableCell></TableRow>}
      </TableBody></Table>
      <div className="flex justify-end items-center gap-3"><Button variant="outline" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>Previous</Button><span className="text-sm">Page {safePage} of {pages}</span><Button variant="outline" disabled={safePage >= pages} onClick={() => setPage(safePage + 1)}>Next</Button></div>
    </section>
    <Dialog open={!!voidId} onOpenChange={open => { if (!open) setVoidId(null); }}><DialogContent><DialogHeader><DialogTitle>Void sweeps receipt</DialogTitle></DialogHeader><Label htmlFor="void-reason">Correction reason</Label><Textarea id="void-reason" value={reason} onChange={e => setReason(e.target.value)} /><Button variant="destructive" disabled={!reason.trim() || voidReceipt.isPending} onClick={() => voidReceipt.mutate()}>Void receipt and remove credits</Button></DialogContent></Dialog>
  </div>;
}