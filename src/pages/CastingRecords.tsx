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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { generateFlaskCode } from '@/lib/metalUtils';

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
    case 'open_with_sprue_transfer': return 'Partial Transfer';
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

  const completeCasting = useMutation({
    mutationFn: async (values: any) => {
      const casting = selectedCasting;
      const returnedButton = values.returnedButtonGrams;
      const finishedJewelry = values.finishedJewelryGrams;
      const sprueTrans = Number(casting.sprue_transferred_to_next_casting_grams ?? 0);
      const totalAccounted = returnedButton + finishedJewelry + sprueTrans;
      const discrepancyGrams = Number(casting.extracted_grams) - totalAccounted;
      const discrepancyPercent = (Math.abs(discrepancyGrams) / Number(casting.extracted_grams)) * 100;
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
      const newTransferredOut = values.transferredOutGrams;
      const extracted = Number(casting.extracted_grams);
      const oldSprueTrans = Number(casting.sprue_transferred_to_next_casting_grams ?? 0);
      const totalAccounted = returnedButton + finishedJewelry + newTransferredOut;
      const discrepancyGrams = extracted - totalAccounted;
      const discrepancyPercent = (Math.abs(discrepancyGrams) / extracted) * 100;
      const tolerance = settings?.default_discrepancy_tolerance_percent ?? 2;
      const flag = discrepancyPercent > tolerance;

      const oldReturned = Number(casting.returned_button_grams) || 0;
      const returnedDelta = returnedButton - oldReturned;

      const updatePayload: any = {
        returned_button_grams: returnedButton,
        finished_jewelry_grams: finishedJewelry,
        discrepancy_grams: discrepancyGrams,
        discrepancy_percent: discrepancyPercent,
        tolerance_percent_used: tolerance,
        discrepancy_flag: flag,
        status: (flag ? 'flagged' : 'completed') as any,
        abnormality_note: values.abnormalityNote || null,
      };

      // If transferred out changed, update it
      if (newTransferredOut !== oldSprueTrans) {
        updatePayload.sprue_transferred_to_next_casting_grams = newTransferredOut;
        updatePayload.has_sprue_transfer = newTransferredOut > 0;
      }

      const { error } = await supabase
        .from('casting_records')
        .update(updatePayload)
        .eq('id', casting.id);
      if (error) throw error;

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

      // Audit log for the adjustment
      await supabase.from('audit_logs').insert({
        action_type: 'admin_casting_adjustment',
        entity_type: 'casting_record',
        entity_id: casting.id,
        user_id: user!.id,
        before_json: {
          returned_button: oldReturned,
          finished_jewelry: Number(casting.finished_jewelry_grams ?? 0),
          transferred_out: oldSprueTrans,
        },
        after_json: {
          returned_button: returnedButton,
          finished_jewelry: finishedJewelry,
          transferred_out: newTransferredOut,
        },
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

  const deleteCasting = useMutation({
    mutationFn: async () => {
      const casting = selectedCasting;
      if (!casting || !user) throw new Error('Missing data');

      const sourceFromInventory = Number((casting as any).source_from_inventory_grams ?? casting.extracted_grams ?? 0);
      const returnedButton = Number(casting.returned_button_grams ?? 0);
      const isCompleted = casting.status === 'completed' || casting.status === 'flagged';

      // Reverse inventory effects:
      // Extraction took source_from_inventory_grams from stock → add back
      // If completed, returned_button_grams was added to stock → subtract back
      const stockAdjustment = sourceFromInventory - (isCompleted ? returnedButton : 0);

      if (stockAdjustment !== 0) {
        const metal = metals?.find((m) => m.id === casting.metal_type_id);
        if (metal) {
          await supabase.from('metal_types').update({
            current_stock_grams: Number(metal.current_stock_grams) + stockAdjustment,
          }).eq('id', casting.metal_type_id);

          await supabase.from('inventory_transactions').insert({
            metal_type_id: casting.metal_type_id,
            grams: Math.abs(stockAdjustment),
            transaction_type: 'manual_adjustment',
            entered_by_user_id: user.id,
            notes: `Admin deleted casting ${casting.casting_code} — reversed ${stockAdjustment > 0 ? '+' : ''}${stockAdjustment.toFixed(2)}g to inventory`,
          });
        }
      }

      // Audit log before deletion
      await supabase.from('audit_logs').insert({
        action_type: 'admin_casting_deleted',
        entity_type: 'casting_record',
        entity_id: casting.id,
        user_id: user.id,
        before_json: {
          casting_code: casting.casting_code,
          extracted_grams: Number(casting.extracted_grams),
          status: casting.status,
          metal_type_id: casting.metal_type_id,
          source_from_inventory_grams: sourceFromInventory,
          returned_button_grams: returnedButton,
          finished_jewelry_grams: Number(casting.finished_jewelry_grams ?? 0),
          sprue_transferred_out: Number(casting.sprue_transferred_to_next_casting_grams ?? 0),
          stock_adjustment: stockAdjustment,
        },
      });

      // Nullify foreign key references before deleting
      await supabase.from('inventory_transactions')
        .update({ related_casting_id: null })
        .eq('related_casting_id', casting.id);

      // Also nullify source_open_casting_id on any castings that referenced this one
      await supabase.from('casting_records')
        .update({ source_open_casting_id: null })
        .eq('source_open_casting_id', casting.id);

      const { error } = await supabase
        .from('casting_records')
        .delete()
        .eq('id', casting.id);
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

  const createCasting = useMutation({
    mutationFn: async (values: { metalId: string; totalGrams: number; sourceOpenCastingId?: string; openCastingGrams: number; jobReference: string; notes: string }) => {
      if (!user) throw new Error('Not authenticated');
      const metal = metals?.find(m => m.id === values.metalId);
      if (!metal) throw new Error('Metal not found');

      const fromOpenCasting = values.openCastingGrams;
      const fromInventory = Math.round((values.totalGrams - fromOpenCasting) * 100) / 100;
      const available = Number(metal.current_stock_grams);

      if (fromInventory > available) throw new Error('Insufficient inventory stock');

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
        source_from_inventory_grams: fromInventory,
        source_from_open_casting_grams: fromOpenCasting,
        source_open_casting_id: values.sourceOpenCastingId || null,
        remaining_unfinalized_balance_grams: values.totalGrams,
      } as any);
      if (castError) throw castError;

      if (fromInventory > 0) {
        const newStock = Math.round((available - fromInventory) * 100) / 100;
        await supabase.from('metal_types').update({ current_stock_grams: newStock }).eq('id', metal.id);
        await supabase.from('inventory_transactions').insert({
          metal_type_id: metal.id,
          grams: fromInventory,
          transaction_type: 'extract_for_casting',
          entered_by_user_id: user.id,
          notes: `Casting ${flaskCode} (${fromInventory.toFixed(2)}g from inventory${fromOpenCasting > 0 ? `, ${fromOpenCasting.toFixed(2)}g from open casting` : ''}) — created by admin`,
        });
      }

      if (values.sourceOpenCastingId && fromOpenCasting > 0) {
        // Update source casting's transferred out
        const { data: srcCasting } = await supabase.from('casting_records').select('*').eq('id', values.sourceOpenCastingId).single();
        if (srcCasting) {
          const currentTransferred = Number(srcCasting.sprue_transferred_to_next_casting_grams ?? 0);
          const currentRemaining = Number(srcCasting.remaining_unfinalized_balance_grams ?? Number(srcCasting.extracted_grams) - currentTransferred);
          await supabase.from('casting_records').update({
            sprue_transferred_to_next_casting_grams: currentTransferred + fromOpenCasting,
            remaining_unfinalized_balance_grams: Math.round((currentRemaining - fromOpenCasting) * 100) / 100,
            has_sprue_transfer: true,
            last_sprue_transfer_at: new Date().toISOString(),
            status: 'open_with_sprue_transfer' as any,
          }).eq('id', values.sourceOpenCastingId);
        }
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
                  <SelectItem value="transfer">Partial Transfer</SelectItem>
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
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Inv.</TableHead>
                <TableHead className="text-right">Reused</TableHead>
                <TableHead className="text-right">Xfer Out</TableHead>
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
                const fromInventory = Number((c as any).source_from_inventory_grams ?? 0);
                const fromOpenCasting = Number((c as any).source_from_open_casting_grams ?? 0);
                return (
                  <TableRow key={c.id} className={cn(isPending && 'cursor-pointer hover:bg-muted/50')} onClick={() => {
                    if (isPending) { setSelectedCasting(c); setCompleteOpen(true); }
                  }}>
                    <TableCell className="text-sm text-muted-foreground">{format(new Date(c.created_at), 'M/d/yyyy')}</TableCell>
                    <TableCell className="font-mono text-sm font-medium">{c.casting_code}</TableCell>
                    <TableCell className="text-sm">{(c.metal_types as any)?.metal_name}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-bold">{Number(c.extracted_grams).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fromInventory > 0 ? fromInventory.toFixed(2) : '—'}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fromOpenCasting > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">{fromOpenCasting.toFixed(2)}</span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {sprueOut > 0 ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">{sprueOut.toFixed(2)}</span>
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
                        {isCompleted && (
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
                  <TableCell colSpan={13} className="text-center text-muted-foreground py-8">No casting records</TableCell>
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

      {/* Adjust completed casting dialog */}
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
              This action cannot be undone. The deletion will be logged in the audit trail.
              <br /><br />
              <span className="text-destructive font-medium">Note: This will NOT automatically restore inventory. Adjust stock manually if needed.</span>
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
  const sprueTrans = Number(casting.sprue_transferred_to_next_casting_grams ?? 0);
  const fromInv = Number(casting.source_from_inventory_grams ?? 0);
  const fromOpen = Number(casting.source_from_open_casting_grams ?? 0);
  const discrepancy = extracted - sprueTrans - (returned + jewelry);
  const discrepancyPct = extracted > 0 ? (Math.abs(discrepancy) / extracted) * 100 : 0;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ returnedButtonGrams: returned, finishedJewelryGrams: jewelry, abnormalityNote }); }} className="space-y-4">
      <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
        <p>Total: <strong>{extracted.toFixed(2)}g</strong></p>
        {fromOpen > 0 && <p className="text-amber-700 dark:text-amber-400">From open casting: <strong>{fromOpen.toFixed(2)}g</strong> · From inventory: <strong>{fromInv.toFixed(2)}g</strong></p>}
        {sprueTrans > 0 && <p className="text-amber-700 dark:text-amber-400">Transferred out: <strong>{sprueTrans.toFixed(2)}g</strong></p>}
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
        <div className={cn('rounded-lg p-3 text-sm', discrepancyPct > 2 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
          Discrepancy: {discrepancy.toFixed(2)}g ({discrepancyPct.toFixed(2)}%)
          {discrepancyPct > 2 && ' ⚠️ Exceeds tolerance'}
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
  const [transferredOutGrams, setTransferredOutGrams] = useState(String(Number(casting.sprue_transferred_to_next_casting_grams ?? 0)));
  const [abnormalityNote, setAbnormalityNote] = useState(casting.abnormality_note ?? '');

  const returned = parseFloat(returnedButtonGrams) || 0;
  const jewelry = parseFloat(finishedJewelryGrams) || 0;
  const transferredOut = parseFloat(transferredOutGrams) || 0;
  const extracted = Number(casting.extracted_grams);
  const fromInv = Number(casting.source_from_inventory_grams ?? 0);
  const fromOpen = Number(casting.source_from_open_casting_grams ?? 0);
  const discrepancy = extracted - transferredOut - (returned + jewelry);
  const discrepancyPct = extracted > 0 ? (Math.abs(discrepancy) / extracted) * 100 : 0;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ returnedButtonGrams: returned, finishedJewelryGrams: jewelry, transferredOutGrams: transferredOut, abnormalityNote }); }} className="space-y-4">
      <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
        <p>Total: <strong>{extracted.toFixed(2)}g</strong></p>
        {fromOpen > 0 && <p className="text-amber-700 dark:text-amber-400">From open casting: <strong>{fromOpen.toFixed(2)}g</strong> · From inventory: <strong>{fromInv.toFixed(2)}g</strong></p>}
        <p className="text-xs text-muted-foreground">
          Previous: Button {Number(casting.returned_button_grams ?? 0).toFixed(2)}g · Jewelry {Number(casting.finished_jewelry_grams ?? 0).toFixed(2)}g · Xfer Out {Number(casting.sprue_transferred_to_next_casting_grams ?? 0).toFixed(2)}g
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
      <div className={cn('rounded-lg p-3 text-sm', discrepancyPct > 2 ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
        Discrepancy: {discrepancy.toFixed(2)}g ({discrepancyPct.toFixed(2)}%)
        {discrepancyPct > 2 && ' ⚠️ Exceeds tolerance'}
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
