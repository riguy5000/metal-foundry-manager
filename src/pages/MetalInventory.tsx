import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Edit } from 'lucide-react';
import { getMetalDotClass } from '@/lib/metalUtils';
import { cn } from '@/lib/utils';

export default function MetalInventory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [addMetalOpen, setAddMetalOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [selectedMetal, setSelectedMetal] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);

  const { data: metals } = useQuery({
    queryKey: ['metal_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('metal_types').select('*').order('display_order');
      if (error) throw error;
      return data;
    },
  });

  const addMetalMutation = useMutation({
    mutationFn: async (values: any) => {
      const { error } = await supabase.from('metal_types').insert(values);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      setAddMetalOpen(false);
      toast.success('Metal type added');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMetalMutation = useMutation({
    mutationFn: async ({ id, ...values }: any) => {
      const { error } = await supabase.from('metal_types').update(values).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      setEditOpen(false);
      toast.success('Metal updated');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const adjustStockMutation = useMutation({
    mutationFn: async ({ metalId, grams, type, notes }: any) => {
      const { error: txError } = await supabase.from('inventory_transactions').insert({
        metal_type_id: metalId,
        grams: Math.abs(grams),
        transaction_type: type,
        entered_by_user_id: user!.id,
        notes,
      });
      if (txError) throw txError;

      const metal = metals?.find((m) => m.id === metalId);
      if (!metal) throw new Error('Metal not found');

      const delta = type === 'add_stock' || type === 'return_from_casting' ? Math.abs(grams) : -Math.abs(grams);
      const newStock = Number(metal.current_stock_grams) + delta;

      const { error: updateError } = await supabase
        .from('metal_types')
        .update({ current_stock_grams: newStock })
        .eq('id', metalId);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      setAdjustOpen(false);
      toast.success('Stock adjusted');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Metal Inventory</h1>
        <div className="flex gap-2">
          <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">Adjust Stock</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Adjust Stock</DialogTitle></DialogHeader>
              <StockAdjustForm metals={metals ?? []} onSubmit={(v) => adjustStockMutation.mutate(v)} loading={adjustStockMutation.isPending} />
            </DialogContent>
          </Dialog>
          <Dialog open={addMetalOpen} onOpenChange={setAddMetalOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1.5 h-3.5 w-3.5" />Add Metal</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Metal Type</DialogTitle></DialogHeader>
              <MetalForm onSubmit={(v) => addMetalMutation.mutate(v)} loading={addMetalMutation.isPending} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metal</TableHead>
                <TableHead>Karat</TableHead>
                <TableHead>Family</TableHead>
                <TableHead className="text-right">Stock (g)</TableHead>
                <TableHead className="text-right">Min (g)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metals?.map((m) => {
                const lowStock = m.low_stock_warning_enabled && m.current_stock_grams < m.minimum_threshold_grams;
                const dotClass = getMetalDotClass(m.color_group, m.metal_family);
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={cn('h-2.5 w-2.5 rounded-full', dotClass)} />
                        <span className="font-medium">{m.metal_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.karat_label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{m.metal_family}</TableCell>
                    <TableCell className={cn('text-right font-mono', lowStock ? 'text-destructive font-bold' : '')}>
                      {Number(m.current_stock_grams).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">{Number(m.minimum_threshold_grams).toFixed(0)}</TableCell>
                    <TableCell>
                      {!m.active_status ? (
                        <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                      ) : lowStock ? (
                        <Badge variant="destructive" className="text-[10px]">Low Stock</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-[10px]">OK</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedMetal(m); setEditOpen(true); }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Metal Type</DialogTitle></DialogHeader>
          {selectedMetal && (
            <MetalForm initial={selectedMetal} onSubmit={(v) => updateMetalMutation.mutate({ id: selectedMetal.id, ...v })} loading={updateMetalMutation.isPending} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetalForm({ initial, onSubmit, loading }: { initial?: any; onSubmit: (v: any) => void; loading: boolean }) {
  const [name, setName] = useState(initial?.metal_name ?? '');
  const [karat, setKarat] = useState(initial?.karat_label ?? '');
  const [family, setFamily] = useState(initial?.metal_family ?? 'Gold');
  const [color, setColor] = useState(initial?.color_group ?? '');
  const [threshold, setThreshold] = useState(String(initial?.minimum_threshold_grams ?? 50));
  const [active, setActive] = useState(initial?.active_status ?? true);

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ metal_name: name, karat_label: karat, metal_family: family, color_group: color, minimum_threshold_grams: parseFloat(threshold), active_status: active }); }} className="space-y-4">
      <div className="space-y-2"><Label>Metal Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Karat Label</Label><Input value={karat} onChange={(e) => setKarat(e.target.value)} /></div>
        <div className="space-y-2">
          <Label>Metal Family</Label>
          <Select value={family} onValueChange={setFamily}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="Gold">Gold</SelectItem><SelectItem value="Silver">Silver</SelectItem>
            <SelectItem value="Platinum">Platinum</SelectItem><SelectItem value="Palladium">Palladium</SelectItem>
          </SelectContent></Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Color Group</Label><Input value={color} onChange={(e) => setColor(e.target.value)} /></div>
        <div className="space-y-2"><Label>Min Threshold (g)</Label><Input type="number" step="0.01" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} id="active" />
        <Label htmlFor="active">Active</Label>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? 'Saving...' : initial ? 'Update' : 'Add Metal'}</Button>
    </form>
  );
}

function StockAdjustForm({ metals, onSubmit, loading }: { metals: any[]; onSubmit: (v: any) => void; loading: boolean }) {
  const [metalId, setMetalId] = useState('');
  const [grams, setGrams] = useState('');
  const [type, setType] = useState<string>('add_stock');
  const [notes, setNotes] = useState('');

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ metalId, grams: parseFloat(grams), type, notes }); }} className="space-y-4">
      <div className="space-y-2">
        <Label>Metal</Label>
        <Select value={metalId} onValueChange={setMetalId}><SelectTrigger><SelectValue placeholder="Select metal" /></SelectTrigger><SelectContent>
          {metals.filter((m) => m.active_status).map((m) => <SelectItem key={m.id} value={m.id}>{m.metal_name} {m.karat_label}</SelectItem>)}
        </SelectContent></Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="add_stock">Add Stock</SelectItem>
            <SelectItem value="manual_adjustment">Manual Adjustment (subtract)</SelectItem>
          </SelectContent></Select>
        </div>
        <div className="space-y-2"><Label>Grams</Label><Input type="number" step="0.01" min="0.01" value={grams} onChange={(e) => setGrams(e.target.value)} required /></div>
      </div>
      <div className="space-y-2"><Label>Notes / Reason</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} required placeholder="Required: reason for adjustment" /></div>
      <Button type="submit" className="w-full" disabled={loading || !metalId}>{loading ? 'Processing...' : 'Adjust Stock'}</Button>
    </form>
  );
}
