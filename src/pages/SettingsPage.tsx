import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect } from 'react';
import { getMetalDotClass } from '@/lib/metalUtils';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').limit(1).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: metals } = useQuery({
    queryKey: ['metal_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('metal_types').select('*').order('display_order');
      if (error) throw error;
      return data;
    },
  });

  const [tolerance, setTolerance] = useState('');
  const [lowStockWarnings, setLowStockWarnings] = useState(true);
  const [discrepancyWarnings, setDiscrepancyWarnings] = useState(true);

  useEffect(() => {
    if (settings) {
      setTolerance(String(settings.default_discrepancy_tolerance_percent));
      setLowStockWarnings(settings.enable_low_stock_warnings);
      setDiscrepancyWarnings(settings.enable_discrepancy_warnings);
    }
  }, [settings]);

  const updateSettings = useMutation({
    mutationFn: async () => {
      if (!settings) return;
      const { error } = await supabase.from('settings').update({
        default_discrepancy_tolerance_percent: parseFloat(tolerance),
        enable_low_stock_warnings: lowStockWarnings,
        enable_discrepancy_warnings: discrepancyWarnings,
        updated_by_user_id: user!.id,
      }).eq('id', settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings saved');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateThreshold = useMutation({
    mutationFn: async ({ metalId, threshold }: { metalId: string; threshold: number }) => {
      const { error } = await supabase.from('metal_types').update({ minimum_threshold_grams: threshold }).eq('id', metalId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metal_types'] });
      toast.success('Threshold updated');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Settings</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* General settings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Default Discrepancy Tolerance (%)</Label>
              <Input type="number" step="0.1" min="0" value={tolerance} onChange={(e) => setTolerance(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Enable Low Stock Warnings</Label>
              <Switch checked={lowStockWarnings} onCheckedChange={setLowStockWarnings} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Enable Discrepancy Warnings</Label>
              <Switch checked={discrepancyWarnings} onCheckedChange={setDiscrepancyWarnings} />
            </div>
            <Button onClick={() => updateSettings.mutate()} disabled={updateSettings.isPending} className="w-full">
              {updateSettings.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </CardContent>
        </Card>

        {/* Per-metal thresholds */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Inventory Thresholds per Metal</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metal</TableHead>
                  <TableHead className="text-right">Current (g)</TableHead>
                  <TableHead className="text-right w-[120px]">Threshold (g)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metals?.filter(m => m.active_status).map((m) => {
                  const dotClass = getMetalDotClass(m.color_group, m.metal_family);
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={cn('h-2 w-2 rounded-full', dotClass)} />
                          <span className="text-sm">{m.metal_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{Number(m.current_stock_grams).toFixed(1)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          defaultValue={Number(m.minimum_threshold_grams)}
                          className="h-7 text-xs w-20 ml-auto text-right"
                          onBlur={(e) => {
                            const val = parseFloat(e.target.value);
                            if (!isNaN(val) && val !== Number(m.minimum_threshold_grams)) {
                              updateThreshold.mutate({ metalId: m.id, threshold: val });
                            }
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
