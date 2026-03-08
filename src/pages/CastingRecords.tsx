import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Pencil } from 'lucide-react';

const statusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-success/10 text-success border-success/20';
    case 'flagged': return 'bg-destructive/10 text-destructive border-destructive/20';
    default: return 'bg-muted text-foreground';
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'completed': return 'Completed';
    case 'flagged': return 'Flagged';
    default: return 'Pending';
  }
};

export default function CastingRecords() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [completeOpen, setCompleteOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [selectedCasting, setSelectedCasting] = useState<any>(null);

  // Filter state
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filterMetal, setFilterMetal] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [discrepancyOnly, setDiscrepancyOnly] = useState(false);

  const { data: metals } = useQuery({
    queryKey: ['metal_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('metal_types').select('*').eq('active_status', true).order('display_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: castings } = useQuery({
    queryKey: ['casting_records'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('casting_records')
        .select('*, metal_types(metal_name, karat_label), profiles:extracted_by_user_id(full_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Apply filters
  const filteredCastings = useMemo(() => {
    if (!castings) return [];
    return castings.filter((c) => {
      if (fromDate && c.created_at < fromDate) return false;
      if (toDate && c.created_at > toDate + 'T23:59:59') return false;
      if (filterMetal !== 'all' && c.metal_type_id !== filterMetal) return false;
      if (filterStatus !== 'all') {
        if (filterStatus === 'pending' && c.status !== 'extracted_pending_completion') return false;
        if (filterStatus === 'completed' && c.status !== 'completed') return false;
        if (filterStatus === 'flagged' && c.status !== 'flagged') return false;
      }
      if (discrepancyOnly && !c.discrepancy_flag) return false;
      return true;
    });
  }, [castings, fromDate, toDate, filterMetal, filterStatus, discrepancyOnly]);

  const completeCasting = useMutation({
    mutationFn: async (values: any) => {
      const casting = selectedCasting;
      const returnedButton = values.returnedButtonGrams;
      const finishedJewelry = values.finishedJewelryGrams;
      const totalAccounted = returnedButton + finishedJewelry;
      const discrepancyGrams = Number(casting.extracted_grams) - totalAccounted;
      const discrepancyPercent = (discrepancyGrams / Number(casting.extracted_grams)) * 100;
      const tolerance = settings?.default_discrepancy_tolerance_percent ?? 2;
      const flag = Math.abs(discrepancyPercent) > tolerance;

      const { error } = await supabase
        .from('casting_records')
        .update({
          returned_button_grams: returnedButton,
          finished_jewelry_grams: finishedJewelry,
          discrepancy_grams: discrepancyGrams,
          discrepancy_percent: discrepancyPercent,
          tolerance_percent_used: tolerance,
          discrepancy_flag: flag,
          status: flag ? 'flagged' : 'completed',
          completed_by_user_id: user!.id,
          completed_at: new Date().toISOString(),
          abnormality_note: values.abnormalityNote || null,
        })
        .eq('id', casting.id);
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
      queryClient.invalidateQueries({ queryKey: ['casting_records'] });
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      setCompleteOpen(false);
      toast.success('Casting completed');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const adjustCasting = useMutation({
    mutationFn: async (values: any) => {
      const casting = selectedCasting;
      const returnedButton = values.returnedButtonGrams;
      const finishedJewelry = values.finishedJewelryGrams;
      const extracted = Number(casting.extracted_grams);
      const totalAccounted = returnedButton + finishedJewelry;
      const discrepancyGrams = extracted - totalAccounted;
      const discrepancyPercent = (discrepancyGrams / extracted) * 100;
      const tolerance = settings?.default_discrepancy_tolerance_percent ?? 2;
      const flag = Math.abs(discrepancyPercent) > tolerance;

      // Calculate inventory delta: difference between new and old returned button
      const oldReturned = Number(casting.returned_button_grams) || 0;
      const returnedDelta = returnedButton - oldReturned;

      const { error } = await supabase
        .from('casting_records')
        .update({
          returned_button_grams: returnedButton,
          finished_jewelry_grams: finishedJewelry,
          discrepancy_grams: discrepancyGrams,
          discrepancy_percent: discrepancyPercent,
          tolerance_percent_used: tolerance,
          discrepancy_flag: flag,
          status: flag ? 'flagged' : 'completed',
          abnormality_note: values.abnormalityNote || null,
        })
        .eq('id', casting.id);
      if (error) throw error;

      // Adjust inventory if returned button changed
      if (returnedDelta !== 0) {
        const metal = metals?.find((m) => m.id === casting.metal_type_id);
        if (metal) {
          await supabase.from('metal_types').update({
            current_stock_grams: Number(metal.current_stock_grams) + returnedDelta,
          }).eq('id', casting.metal_type_id);
          await supabase.from('inventory_transactions').insert({
            metal_type_id: casting.metal_type_id,
            grams: Math.abs(returnedDelta),
            transaction_type: 'manual_adjustment',
            entered_by_user_id: user!.id,
            notes: `Admin adjustment on casting ${casting.casting_code} (returned button ${returnedDelta > 0 ? '+' : ''}${returnedDelta.toFixed(2)}g)`,
            related_casting_id: casting.id,
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['casting_records'] });
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      setAdjustOpen(false);
      toast.success('Casting record adjusted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Casting Records</h1>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium mb-3">Filters</p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-36" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-36" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Metal</Label>
              <Select value={filterMetal} onValueChange={setFilterMetal}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Metals</SelectItem>
                  {metals?.map((m) => <SelectItem key={m.id} value={m.id}>{m.metal_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="flagged">Flagged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <Checkbox
                id="disc-only"
                checked={discrepancyOnly}
                onCheckedChange={(v) => setDiscrepancyOnly(!!v)}
              />
              <Label htmlFor="disc-only" className="text-sm">Discrepancy only</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">{filteredCastings.length} records</p>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Metal</TableHead>
                <TableHead className="text-right">Extracted</TableHead>
                <TableHead className="text-right">Jewelry</TableHead>
                <TableHead className="text-right">Returned</TableHead>
                <TableHead className="text-right">Disc. (g)</TableHead>
                <TableHead className="text-right">Disc. %</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Extracted By</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCastings.map((c) => {
                const profile = c.profiles as any;
                const isCompleted = c.status === 'completed' || c.status === 'flagged';
                return (
                  <TableRow key={c.id} className={cn(c.status === 'extracted_pending_completion' && 'cursor-pointer hover:bg-muted/50')} onClick={() => {
                    if (c.status === 'extracted_pending_completion') {
                      setSelectedCasting(c);
                      setCompleteOpen(true);
                    }
                  }}>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(c.created_at), 'M/d/yyyy')}</TableCell>
                    <TableCell className="font-mono text-sm font-medium">{c.casting_code}</TableCell>
                    <TableCell className="text-sm">{(c.metal_types as any)?.metal_name}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-bold">{Number(c.extracted_grams).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{c.finished_jewelry_grams != null ? Number(c.finished_jewelry_grams).toFixed(2) : '—'}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{c.returned_button_grams != null ? Number(c.returned_button_grams).toFixed(2) : '—'}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {c.discrepancy_grams != null ? Number(c.discrepancy_grams).toFixed(2) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {c.discrepancy_percent != null ? (
                        <span className={cn(
                          Math.abs(Number(c.discrepancy_percent)) > 2 ? 'text-destructive font-bold' : ''
                        )}>
                          {Number(c.discrepancy_percent).toFixed(1)}%
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn('text-[10px]', statusColor(c.status))}>
                        {statusLabel(c.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{profile?.full_name ?? '—'}</TableCell>
                    <TableCell>
                      {isCompleted && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCasting(c);
                            setAdjustOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredCastings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground py-8">No casting records</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Complete pending casting dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Complete Casting — {selectedCasting?.casting_code}</DialogTitle></DialogHeader>
          {selectedCasting && (
            <CompleteCastingForm
              casting={selectedCasting}
              onSubmit={(v) => completeCasting.mutate(v)}
              loading={completeCasting.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Adjust completed casting dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust Casting — {selectedCasting?.casting_code}</DialogTitle></DialogHeader>
          {selectedCasting && adjustOpen && (
            <AdjustCastingForm
              casting={selectedCasting}
              onSubmit={(v) => adjustCasting.mutate(v)}
              loading={adjustCasting.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
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
  const discrepancyPct = extracted > 0 ? (discrepancy / extracted) * 100 : 0;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ returnedButtonGrams: returned, finishedJewelryGrams: jewelry, abnormalityNote }); }} className="space-y-4">
      <div className="rounded-lg bg-muted p-3 text-sm">
        <p>Extracted: <strong>{extracted.toFixed(2)}g</strong></p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Returned Button (g)</Label>
          <Input type="number" step="0.01" min="0" value={returnedButtonGrams} onChange={(e) => setReturnedButtonGrams(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Finished Jewelry (g)</Label>
          <Input type="number" step="0.01" min="0" value={finishedJewelryGrams} onChange={(e) => setFinishedJewelryGrams(e.target.value)} required />
        </div>
      </div>
      {(returned > 0 || jewelry > 0) && (
        <div className={cn('rounded-lg p-3 text-sm', Math.abs(discrepancyPct) > 2 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
          Discrepancy: {discrepancy.toFixed(2)}g ({discrepancyPct.toFixed(2)}%)
          {Math.abs(discrepancyPct) > 2 && ' ⚠️ Exceeds tolerance'}
        </div>
      )}
      <div className="space-y-2">
        <Label>Abnormality Note</Label>
        <Textarea value={abnormalityNote} onChange={(e) => setAbnormalityNote(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Completing...' : 'Complete Casting'}
      </Button>
    </form>
  );
}

function AdjustCastingForm({ casting, onSubmit, loading }: { casting: any; onSubmit: (v: any) => void; loading: boolean }) {
  const [returnedButtonGrams, setReturnedButtonGrams] = useState(String(Number(casting.returned_button_grams ?? 0)));
  const [finishedJewelryGrams, setFinishedJewelryGrams] = useState(String(Number(casting.finished_jewelry_grams ?? 0)));
  const [abnormalityNote, setAbnormalityNote] = useState(casting.abnormality_note ?? '');

  const returned = parseFloat(returnedButtonGrams) || 0;
  const jewelry = parseFloat(finishedJewelryGrams) || 0;
  const extracted = Number(casting.extracted_grams);
  const discrepancy = extracted - (returned + jewelry);
  const discrepancyPct = extracted > 0 ? (discrepancy / extracted) * 100 : 0;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ returnedButtonGrams: returned, finishedJewelryGrams: jewelry, abnormalityNote }); }} className="space-y-4">
      <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
        <p>Extracted: <strong>{extracted.toFixed(2)}g</strong></p>
        <p className="text-xs text-muted-foreground">
          Previous: Button {Number(casting.returned_button_grams ?? 0).toFixed(2)}g · Jewelry {Number(casting.finished_jewelry_grams ?? 0).toFixed(2)}g
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Returned Button (g)</Label>
          <Input type="number" step="0.01" min="0" value={returnedButtonGrams} onChange={(e) => setReturnedButtonGrams(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Finished Jewelry (g)</Label>
          <Input type="number" step="0.01" min="0" value={finishedJewelryGrams} onChange={(e) => setFinishedJewelryGrams(e.target.value)} required />
        </div>
      </div>
      <div className={cn('rounded-lg p-3 text-sm', Math.abs(discrepancyPct) > 2 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
        Discrepancy: {discrepancy.toFixed(2)}g ({discrepancyPct.toFixed(2)}%)
        {Math.abs(discrepancyPct) > 2 && ' ⚠️ Exceeds tolerance'}
      </div>
      <div className="space-y-2">
        <Label>Abnormality Note</Label>
        <Textarea value={abnormalityNote} onChange={(e) => setAbnormalityNote(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? 'Saving...' : 'Save Adjustment'}
      </Button>
    </form>
  );
}
