import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect } from 'react';

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
      const { error } = await supabase
        .from('settings')
        .update({
          default_discrepancy_tolerance_percent: parseFloat(tolerance),
          enable_low_stock_warnings: lowStockWarnings,
          enable_discrepancy_warnings: discrepancyWarnings,
          updated_by_user_id: user!.id,
        })
        .eq('id', settings.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.success('Settings saved');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-base">Discrepancy & Alerts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Default Discrepancy Tolerance (%)</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
            />
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
    </div>
  );
}
