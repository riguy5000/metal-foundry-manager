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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { generateFlaskCode } from '@/lib/metalUtils';
import { applyMetalStockDelta } from '@/lib/inventoryUtils';

const statusColor = (status: string) => {
  switch (status) {
    case 'completed': return 'bg-success/10 text-success border-success/20';
    case 'flagged': return 'bg-destructive/10 text-destructive border-destructive/20';
    case 'open_with_sprue_transfer': return 'bg-amber-100/50 text-amber-800 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300';
    default: return 'bg-muted text-foreground';
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case 'completed': return 'Completed';
    case 'flagged': return 'Flagged';
    case 'open_with_sprue_transfer': return 'Open + Transfer';
    default: return 'Pending';
  }
};

export default function CastingRecords() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [completeOpen, setCompleteOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCasting, setSelectedCasting] = useState<any>(null);

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
        .select('*, metal_types(metal_name, karat_label, current_stock_grams), profiles:extracted_by_user_id(full_name)')
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
        if (filterStatus === 'transfer' && c.status !== 'open_with_sprue_transfer') return false;
      }
      if (discrepancyOnly && !c.discrepancy_flag) return false;
      return true;
    });
  }, [castings, fromDate, toDate, filterMetal, filterStatus, discrepancyOnly]);

  // ── COMPLETE pending casting ──
  const completeCasting = useMutation({
    mutationFn: async (values: any) => {
      const casting = selectedCasting;
      const returnedButton = values.returnedButtonGrams;
      const finishedJewelry = values.finishedJewelryGrams;
      const sprueTrans = Number(casting.sprue_transferred_to_next_casting_grams ?? 0);
      const extracted = Number(casting.extracted_grams);
      const maxCompletable = Math.max(0, extracted - sprueTrans);
      const totalOutputs = returnedButton + finishedJewelry;
      if (totalOutputs > maxCompletable + 0.01) {
        throw new Error(`Returned + Jewelry (${totalOutputs.toFixed(2)}g) exceeds remaining balance (${maxCompletable.toFixed(2)}g)`);
      }

      const totalAccounted = totalOutputs + sprueTrans;
      const discrepancyGrams = extracted - totalAccounted;
      const discrepancyPercent = (Math.abs(discrepancyGrams) / extracted) * 100;
      const tolerance = settings?.default_discrepancy_tolerance_percent ?? 2;
      const flag = discrepancyPercent > tolerance;

      const { error } = await supabase
        .from('casting_records')
        .update({
          returned_button_grams: returnedButton,
          finished_jewelry_grams: finishedJewelry,
          discrepancy_grams: discrepancyGrams,
          discrepancy_percent: discrepancyPercent,
          tolerance_percent_used: tolerance,
          discrepancy_flag: flag,
          status: (flag ? 'flagged' : 'completed') as any,
          completed_by_user_id: user!.id,
          completed_at: new Date().toISOString(),
          abnormality_note: values.abnormalityNote || null,
          remaining_unfinalized_balance_grams: 0,
        })
        .eq('id', casting.id);
      if (error) throw error;

      if (returnedButton > 0) {
        const { before: stockBefore, after: stockAfter } = await applyMetalStockDelta(casting.metal_type_id, returnedButton);
        const { error: txError } = await supabase.from('inventory_transactions').insert({
          metal_type_id: casting.metal_type_id,
          grams: returnedButton,
          transaction_type: 'return_from_casting',
          entered_by_user_id: user!.id,
          notes: `Casting ${casting.casting_code} returned ${returnedButton.toFixed(2)}g button/sprue to stock`,
          related_casting_id: casting.id,
          related_casting_code: casting.casting_code,
          stock_before_grams: stockBefore,
          stock_after_grams: stockAfter,
          performed_by_name: user!.email ?? null,
        } as any);
        if (txError) {
          await applyMetalStockDelta(casting.metal_type_id, -returnedButton);
          throw txError;
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

  // ── ADJUST casting ──
  const adjustCasting = useMutation({
    mutationFn: async (values: any) => {
      const casting = selectedCasting;
      const returnedButton = values.returnedButtonGrams;
      const finishedJewelry = values.finishedJewelryGrams;
      const newTransferredOut = values.transferredOutGrams;
      const extracted = Number(casting.extracted_grams);
      const oldSprueTrans = Number(casting.sprue_transferred_to_next_casting_grams ?? 0);
      const oldReturned = Number(casting.returned_button_grams ?? 0);
      const returnedDelta = returnedButton - oldReturned;
      const transferDelta = newTransferredOut - oldSprueTrans;
      const totalOutputs = returnedButton + finishedJewelry;

      // Transfer delta: increasing transferred out = metal going TO stock (+), decreasing = metal coming FROM stock (-)
      const totalInventoryDelta = returnedDelta + transferDelta;

      if (newTransferredOut > extracted + 0.01) {
        throw new Error(`Transferred out (${newTransferredOut.toFixed(2)}g) cannot exceed extracted (${extracted.toFixed(2)}g)`);
      }

      const maxCompletable = Math.max(0, extracted - newTransferredOut);
      if (totalOutputs > maxCompletable + 0.01) {
        throw new Error(`Returned + Jewelry (${totalOutputs.toFixed(2)}g) exceeds remaining balance (${maxCompletable.toFixed(2)}g)`);
      }

      // Validate inventory availability
      if (totalInventoryDelta < 0) {
        const { data: metalRow, error: metalError } = await supabase
          .from('metal_types')
          .select('current_stock_grams')
          .eq('id', casting.metal_type_id)
          .maybeSingle();
        if (metalError) throw metalError;
        const availableStock = Number(metalRow?.current_stock_grams ?? 0);
        if (availableStock + totalInventoryDelta < -0.01) {
          throw new Error(`Cannot save: this change removes ${Math.abs(totalInventoryDelta).toFixed(2)}g from inventory, but only ${availableStock.toFixed(2)}g is available.`);
        }
      }

      // Apply inventory delta first
      let stockResult = { before: 0, after: 0 };
      if (totalInventoryDelta !== 0) {
        stockResult = await applyMetalStockDelta(casting.metal_type_id, totalInventoryDelta);
      }

      // Build casting update
      const isBeingCompleted = returnedButton > 0 || finishedJewelry > 0;
      const wasAlreadyCompleted = casting.status === 'completed' || casting.status === 'flagged';

      const updatePayload: any = {
        returned_button_grams: returnedButton,
        finished_jewelry_grams: finishedJewelry,
        abnormality_note: values.abnormalityNote || null,
      };

      if (isBeingCompleted || wasAlreadyCompleted) {
        const totalAccounted = totalOutputs + newTransferredOut;
        const discrepancyGrams = extracted - totalAccounted;
        const discrepancyPercent = (Math.abs(discrepancyGrams) / extracted) * 100;
        const tolerance = settings?.default_discrepancy_tolerance_percent ?? 2;
        const flag = discrepancyPercent > tolerance;

        updatePayload.discrepancy_grams = discrepancyGrams;
        updatePayload.discrepancy_percent = discrepancyPercent;
        updatePayload.tolerance_percent_used = tolerance;
        updatePayload.discrepancy_flag = flag;
        updatePayload.status = (flag ? 'flagged' : 'completed') as any;
        if (!wasAlreadyCompleted) {
          updatePayload.completed_by_user_id = user!.id;
          updatePayload.completed_at = new Date().toISOString();
          updatePayload.remaining_unfinalized_balance_grams = 0;
        }
      } else {
        if (newTransferredOut > 0) {
          updatePayload.status = 'open_with_sprue_transfer' as any;
        }
      }

      if (transferDelta !== 0) {
        updatePayload.sprue_transferred_to_next_casting_grams = newTransferredOut;
        updatePayload.has_sprue_transfer = newTransferredOut > 0;
      }

      const { error } = await supabase
        .from('casting_records')
        .update(updatePayload)
        .eq('id', casting.id);

      if (error) {
        if (totalInventoryDelta !== 0) await applyMetalStockDelta(casting.metal_type_id, -totalInventoryDelta);
        throw error;
      }

      // Log transaction
      if (totalInventoryDelta !== 0) {
        const parts: string[] = [];
        if (returnedDelta !== 0) parts.push(`returned button ${returnedDelta > 0 ? '+' : ''}${returnedDelta.toFixed(2)}g`);
        if (transferDelta !== 0) parts.push(`transferred out ${transferDelta > 0 ? '+' : ''}${transferDelta.toFixed(2)}g`);

        const { error: txError } = await supabase.from('inventory_transactions').insert({
          metal_type_id: casting.metal_type_id,
          grams: Math.abs(totalInventoryDelta),
          transaction_type: 'manual_adjustment',
          entered_by_user_id: user!.id,
          notes: `Admin adjustment on casting ${casting.casting_code} (${parts.join(', ')})`,
          related_casting_id: casting.id,
        });

        if (txError) {
          await applyMetalStockDelta(casting.metal_type_id, -totalInventoryDelta);
          throw txError;
        }
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        action_type: 'admin_casting_adjustment',
        entity_type: 'casting_record',
        entity_id: casting.id,
        user_id: user!.id,
        before_json: { returned_button: oldReturned, finished_jewelry: Number(casting.finished_jewelry_grams ?? 0), transferred_out: oldSprueTrans },
        after_json: { returned_button: returnedButton, finished_jewelry: finishedJewelry, transferred_out: newTransferredOut },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['casting_records'] });
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      setAdjustOpen(false);
      toast.success('Casting record adjusted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── DELETE casting ──
  const deleteCasting = useMutation({
    mutationFn: async () => {
      const casting = selectedCasting;
      if (!casting || !user) throw new Error('Missing data');

      const extracted = Number(casting.extracted_grams);
      const returnedButton = Number(casting.returned_button_grams ?? 0);
      const sprueTrans = Number(casting.sprue_transferred_to_next_casting_grams ?? 0);
      const isCompleted = casting.status === 'completed' || casting.status === 'flagged';

      // Reverse all inventory effects:
      // Extraction took extracted_grams from stock → add back
      // If completed, returned_button_grams was added to stock → subtract
      // sprue transfers were already added to stock → subtract
      const stockAdjustment = extracted - (isCompleted ? returnedButton : 0) - sprueTrans;

      if (stockAdjustment !== 0) {
        await applyMetalStockDelta(casting.metal_type_id, stockAdjustment);

        const { error: txError } = await supabase.from('inventory_transactions').insert({
          metal_type_id: casting.metal_type_id,
          grams: Math.abs(stockAdjustment),
          transaction_type: 'manual_adjustment',
          entered_by_user_id: user.id,
          notes: `Admin deleted casting ${casting.casting_code} — reversed ${stockAdjustment > 0 ? '+' : ''}${stockAdjustment.toFixed(2)}g to inventory`,
        });

        if (txError) {
          await applyMetalStockDelta(casting.metal_type_id, -stockAdjustment);
          throw txError;
        }
      }

      // Audit log
      await supabase.from('audit_logs').insert({
        action_type: 'admin_casting_deleted',
        entity_type: 'casting_record',
        entity_id: casting.id,
        user_id: user.id,
        before_json: {
          casting_code: casting.casting_code,
          extracted_grams: extracted,
          status: casting.status,
          returned_button_grams: returnedButton,
          sprue_transferred: sprueTrans,
          stock_adjustment: stockAdjustment,
        },
      });

      // Nullify foreign key references
      await supabase.from('inventory_transactions').update({ related_casting_id: null }).eq('related_casting_id', casting.id);
      await supabase.from('casting_records').update({ source_open_casting_id: null }).eq('source_open_casting_id', casting.id);

      const { error } = await supabase.from('casting_records').delete().eq('id', casting.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['casting_records'] });
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      setDeleteOpen(false);
      setSelectedCasting(null);
      toast.success('Casting record deleted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── CREATE casting ──
  const createCasting = useMutation({
    mutationFn: async (values: { metalId: string; totalGrams: number; jobReference: string; notes: string }) => {
      if (!user) throw new Error('Not authenticated');
      const metal = metals?.find(m => m.id === values.metalId);
      if (!metal) throw new Error('Metal not found');

      const available = Number(metal.current_stock_grams);
      if (values.totalGrams > available + 0.01) throw new Error('Insufficient inventory stock');

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
        extracted_grams: values.totalGrams,
        extracted_by_user_id: user.id,
        job_reference: values.jobReference || null,
        notes: values.notes || null,
        source_from_inventory_grams: values.totalGrams,
        source_from_open_casting_grams: 0,
        remaining_unfinalized_balance_grams: values.totalGrams,
      } as any);
      if (castError) throw castError;

      await applyMetalStockDelta(metal.id, -values.totalGrams);

      const { error: txError } = await supabase.from('inventory_transactions').insert({
        metal_type_id: metal.id,
        grams: values.totalGrams,
        transaction_type: 'extract_for_casting',
        entered_by_user_id: user.id,
        notes: `Casting ${flaskCode} — ${values.totalGrams.toFixed(2)}g extracted (admin)`,
      });

      if (txError) {
        await applyMetalStockDelta(metal.id, values.totalGrams);
        throw txError;
      }

      return flaskCode;
    },
    onSuccess: (flaskCode) => {
      queryClient.invalidateQueries({ queryKey: ['casting_records'] });
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      setCreateOpen(false);
      toast.success(`Casting ${flaskCode} created`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Casting Records</h1>
        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Casting
        </Button>
      </div>

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
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="transfer">Open + Transfer</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="flagged">Flagged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-0.5">
              <Checkbox id="disc-only" checked={discrepancyOnly} onCheckedChange={(v) => setDiscrepancyOnly(!!v)} />
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
                <TableHead className="text-right">Xfer to Stock</TableHead>
                <TableHead className="text-right">Jewelry</TableHead>
                <TableHead className="text-right">Returned</TableHead>
                <TableHead className="text-right">Disc. %</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>By</TableHead>
                <TableHead className="w-20"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCastings.map((c) => {
                const profile = c.profiles as any;
                const isCompleted = c.status === 'completed' || c.status === 'flagged';
                const isPending = c.status === 'extracted_pending_completion' || c.status === 'open_with_sprue_transfer';
                const sprueOut = Number(c.sprue_transferred_to_next_casting_grams ?? 0);
                return (
                  <TableRow key={c.id} className={cn(isPending && 'cursor-pointer hover:bg-muted/50')} onClick={() => {
                    if (isPending) { setSelectedCasting(c); setCompleteOpen(true); }
                  }}>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(c.created_at), 'M/d/yyyy')}</TableCell>
                    <TableCell className="font-mono text-sm font-medium">{c.casting_code}</TableCell>
                    <TableCell className="text-sm">{(c.metal_types as any)?.metal_name}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-bold">{Number(c.extracted_grams).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {sprueOut > 0 ? (
                        <span className="text-sky-600 dark:text-sky-400 font-medium">{sprueOut.toFixed(2)}</span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{c.finished_jewelry_grams != null ? Number(c.finished_jewelry_grams).toFixed(2) : '—'}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{c.returned_button_grams != null ? Number(c.returned_button_grams).toFixed(2) : '—'}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {c.discrepancy_percent != null ? (
                        <span className={cn(Math.abs(Number(c.discrepancy_percent)) > 2 ? 'text-destructive font-bold' : '')}>
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
                      <div className="flex items-center gap-1">
                        {(isCompleted || isPending) && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCasting(c);
                            setAdjustOpen(true);
                          }}>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCasting(c);
                          setDeleteOpen(true);
                        }}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
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
            <CompleteCastingForm casting={selectedCasting} onSubmit={(v) => completeCasting.mutate(v)} loading={completeCasting.isPending} />
          )}
        </DialogContent>
      </Dialog>

      {/* Adjust casting dialog */}
      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adjust Casting — {selectedCasting?.casting_code}</DialogTitle></DialogHeader>
          {selectedCasting && adjustOpen && (
            <AdjustCastingForm casting={selectedCasting} onSubmit={(v) => adjustCasting.mutate(v)} loading={adjustCasting.isPending} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Casting Record</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete casting <strong className="font-mono">{selectedCasting?.casting_code}</strong>?
              This action cannot be undone. Inventory will be automatically adjusted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteCasting.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteCasting.isPending}
            >
              {deleteCasting.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create new casting dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Casting</DialogTitle>
            <DialogDescription>Create a casting record and deduct from inventory.</DialogDescription>
          </DialogHeader>
          <CreateCastingForm metals={metals ?? []} onSubmit={(v) => createCasting.mutate(v)} loading={createCasting.isPending} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Complete Form ──
function CompleteCastingForm({ casting, onSubmit, loading }: { casting: any; onSubmit: (v: any) => void; loading: boolean }) {
  const [returnedButtonGrams, setReturnedButtonGrams] = useState('');
  const [finishedJewelryGrams, setFinishedJewelryGrams] = useState('');
  const [abnormalityNote, setAbnormalityNote] = useState('');

  const returned = parseFloat(returnedButtonGrams) || 0;
  const jewelry = parseFloat(finishedJewelryGrams) || 0;
  const extracted = Number(casting.extracted_grams);
  const sprueTrans = Number(casting.sprue_transferred_to_next_casting_grams ?? 0);
  const remainingAfterTransfer = Math.max(0, extracted - sprueTrans);
  const totalOutputs = returned + jewelry;
  const overLimit = totalOutputs > remainingAfterTransfer + 0.01;
  const discrepancy = extracted - sprueTrans - totalOutputs;
  const discrepancyPct = extracted > 0 ? (Math.abs(discrepancy) / extracted) * 100 : 0;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ returnedButtonGrams: returned, finishedJewelryGrams: jewelry, abnormalityNote }); }} className="space-y-4">
      <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
        <p>Extracted: <strong>{extracted.toFixed(2)}g</strong></p>
        {sprueTrans > 0 && <p className="text-sky-700 dark:text-sky-400">Transferred to stock: <strong>{sprueTrans.toFixed(2)}g</strong></p>}
        <p>Remaining to finalize: <strong>{remainingAfterTransfer.toFixed(2)}g</strong></p>
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
      {overLimit && (
        <div className="rounded-lg p-3 text-sm bg-destructive/10 text-destructive">
          Returned + Jewelry ({totalOutputs.toFixed(2)}g) exceeds remaining balance ({remainingAfterTransfer.toFixed(2)}g)
        </div>
      )}
      {(returned > 0 || jewelry > 0) && (
        <div className={cn('rounded-lg p-3 text-sm', discrepancyPct > 2 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
          Discrepancy: {discrepancy.toFixed(2)}g ({discrepancyPct.toFixed(2)}%)
          {discrepancyPct > 2 && ' ⚠️ Exceeds tolerance'}
        </div>
      )}
      <div className="space-y-2">
        <Label>Abnormality Note</Label>
        <Textarea value={abnormalityNote} onChange={(e) => setAbnormalityNote(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading || overLimit}>
        {loading ? 'Completing...' : 'Complete Casting'}
      </Button>
    </form>
  );
}

// ── Adjust Form ──
function AdjustCastingForm({ casting, onSubmit, loading }: { casting: any; onSubmit: (v: any) => void; loading: boolean }) {
  const [returnedButtonGrams, setReturnedButtonGrams] = useState(String(Number(casting.returned_button_grams ?? 0)));
  const [finishedJewelryGrams, setFinishedJewelryGrams] = useState(String(Number(casting.finished_jewelry_grams ?? 0)));
  const [transferredOutGrams, setTransferredOutGrams] = useState(String(Number(casting.sprue_transferred_to_next_casting_grams ?? 0)));
  const [abnormalityNote, setAbnormalityNote] = useState(casting.abnormality_note ?? '');

  const returned = parseFloat(returnedButtonGrams) || 0;
  const jewelry = parseFloat(finishedJewelryGrams) || 0;
  const transferredOut = parseFloat(transferredOutGrams) || 0;
  const extracted = Number(casting.extracted_grams);
  const previousTransferredOut = Number(casting.sprue_transferred_to_next_casting_grams ?? 0);
  const previousReturnedButton = Number(casting.returned_button_grams ?? 0);
  const currentStock = Number((casting.metal_types as any)?.current_stock_grams ?? 0);
  const projectedInventoryDelta = (returned - previousReturnedButton) + (transferredOut - previousTransferredOut);
  const insufficientInventory = projectedInventoryDelta < 0 && (currentStock + projectedInventoryDelta) < -0.01;
  const remainingAfterTransfer = Math.max(0, extracted - transferredOut);
  const totalOutputs = returned + jewelry;
  const overTransfer = transferredOut > extracted + 0.01;
  const overLimit = overTransfer || totalOutputs > remainingAfterTransfer + 0.01;
  const discrepancy = extracted - transferredOut - totalOutputs;
  const discrepancyPct = extracted > 0 ? (Math.abs(discrepancy) / extracted) * 100 : 0;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ returnedButtonGrams: returned, finishedJewelryGrams: jewelry, transferredOutGrams: transferredOut, abnormalityNote }); }} className="space-y-4">
      <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
        <p>Extracted: <strong>{extracted.toFixed(2)}g</strong></p>
        <p>Remaining after transfer: <strong>{remainingAfterTransfer.toFixed(2)}g</strong></p>
        <p className="text-xs text-muted-foreground">
          Rule: Returned + Jewelry + Xfer Out = Extracted → 0 discrepancy
        </p>
        <p className="text-xs text-muted-foreground">
          Previous: Button {previousReturnedButton.toFixed(2)}g · Jewelry {Number(casting.finished_jewelry_grams ?? 0).toFixed(2)}g · Xfer {previousTransferredOut.toFixed(2)}g
        </p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label className="text-xs">Returned Button (g)</Label>
          <Input type="number" step="0.01" min="0" value={returnedButtonGrams} onChange={(e) => setReturnedButtonGrams(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Finished Jewelry (g)</Label>
          <Input type="number" step="0.01" min="0" value={finishedJewelryGrams} onChange={(e) => setFinishedJewelryGrams(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Transferred Out (g)</Label>
          <Input type="number" step="0.01" min="0" value={transferredOutGrams} onChange={(e) => setTransferredOutGrams(e.target.value)} />
        </div>
      </div>
      {overLimit && (
        <div className="rounded-lg p-3 text-sm bg-destructive/10 text-destructive">
          {overTransfer
            ? `Transferred out (${transferredOut.toFixed(2)}g) cannot exceed extracted (${extracted.toFixed(2)}g)`
            : `Returned + Jewelry (${totalOutputs.toFixed(2)}g) exceeds remaining balance (${remainingAfterTransfer.toFixed(2)}g)`}
        </div>
      )}
      {insufficientInventory && (
        <div className="rounded-lg p-3 text-sm bg-destructive/10 text-destructive">
          Cannot save: change needs {Math.abs(projectedInventoryDelta).toFixed(2)}g from inventory, but only {currentStock.toFixed(2)}g available.
        </div>
      )}
      <div className={cn('rounded-lg p-3 text-sm', discrepancyPct > 2 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
        Discrepancy: {discrepancy.toFixed(2)}g ({discrepancyPct.toFixed(2)}%)
        {discrepancyPct > 2 && ' ⚠️ Exceeds tolerance'}
      </div>
      <div className="space-y-2">
        <Label>Abnormality Note</Label>
        <Textarea value={abnormalityNote} onChange={(e) => setAbnormalityNote(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading || overLimit || insufficientInventory}>
        {loading ? 'Saving...' : 'Save Adjustment'}
      </Button>
    </form>
  );
}

// ── Create Form (simplified — all from stock) ──
function CreateCastingForm({ metals, onSubmit, loading }: { metals: any[]; onSubmit: (v: any) => void; loading: boolean }) {
  const [metalId, setMetalId] = useState('');
  const [grams, setGrams] = useState('');
  const [jobReference, setJobReference] = useState('');
  const [notes, setNotes] = useState('');

  const selectedMetal = metals.find(m => m.id === metalId);
  const totalGrams = parseFloat(grams) || 0;
  const available = selectedMetal ? Number(selectedMetal.current_stock_grams) : 0;
  const insufficientStock = totalGrams > available + 0.01;

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (insufficientStock) return;
      onSubmit({ metalId, totalGrams, jobReference, notes });
    }} className="space-y-4">
      <div className="space-y-2">
        <Label>Metal Type</Label>
        <Select value={metalId} onValueChange={setMetalId}>
          <SelectTrigger><SelectValue placeholder="Select metal" /></SelectTrigger>
          <SelectContent>
            {metals.map(m => (
              <SelectItem key={m.id} value={m.id}>{m.metal_name} — {Number(m.current_stock_grams).toFixed(2)}g</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedMetal && (
        <div className="rounded-lg bg-muted p-3 text-sm">
          Available inventory: <strong className="font-mono">{available.toFixed(2)}g</strong>
        </div>
      )}

      <div className="space-y-2">
        <Label>Total Grams</Label>
        <Input type="number" step="0.01" min="0.01" value={grams} onChange={(e) => setGrams(e.target.value)} placeholder="0.00" className="font-mono" inputMode="decimal" required />
      </div>

      {totalGrams > 0 && metalId && (
        <div className={cn('rounded-lg p-3 text-sm', insufficientStock ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
          {insufficientStock ? 'Insufficient inventory stock' : (
            <p>From inventory: <strong>{totalGrams.toFixed(2)}g</strong> → Remaining: <strong>{(available - totalGrams).toFixed(2)}g</strong></p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label className="text-xs">Job Reference</Label>
          <Input value={jobReference} onChange={(e) => setJobReference(e.target.value)} placeholder="e.g. WO-1234" className="h-9" />
        </div>
        <div className="space-y-2">
          <Label className="text-xs">Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="h-9" />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={loading || totalGrams <= 0 || !metalId || insufficientStock}>
        {loading ? 'Creating...' : `Create Casting${totalGrams > 0 ? ` — ${totalGrams.toFixed(2)}g` : ''}`}
      </Button>
    </form>
  );
}
