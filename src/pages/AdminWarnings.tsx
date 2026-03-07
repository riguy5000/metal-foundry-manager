import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Flag } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { getMetalDotClass } from '@/lib/metalUtils';
import { cn } from '@/lib/utils';

export default function AdminWarnings() {
  const { data: metals } = useQuery({
    queryKey: ['metal_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('metal_types').select('*').order('display_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: flaggedCastings } = useQuery({
    queryKey: ['flagged_castings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('casting_records')
        .select('*, metal_types(metal_name, karat_label, color_group, metal_family)')
        .eq('status', 'flagged')
        .order('completed_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const lowStockMetals = metals?.filter(
    (m) => m.active_status && m.low_stock_warning_enabled && m.current_stock_grams < m.minimum_threshold_grams
  ) ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Warnings & Discrepancies</h1>

      {/* Low stock section */}
      <Card className={cn(lowStockMetals.length > 0 && 'border-destructive/30')}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className={cn('h-4 w-4', lowStockMetals.length > 0 ? 'text-destructive' : 'text-muted-foreground')} />
            Low Stock Alerts
            {lowStockMetals.length > 0 && (
              <Badge variant="destructive" className="ml-auto">{lowStockMetals.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lowStockMetals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">All metals above minimum threshold ✓</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Metal</TableHead>
                  <TableHead className="text-right">Current Stock</TableHead>
                  <TableHead className="text-right">Threshold</TableHead>
                  <TableHead className="text-right">Deficit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStockMetals.map((m) => {
                  const dotClass = getMetalDotClass(m.color_group, m.metal_family);
                  const deficit = Number(m.minimum_threshold_grams) - Number(m.current_stock_grams);
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={cn('h-2.5 w-2.5 rounded-full', dotClass)} />
                          <span className="font-medium">{m.metal_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-destructive font-bold">
                        {Number(m.current_stock_grams).toFixed(1)}g
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {Number(m.minimum_threshold_grams).toFixed(0)}g
                      </TableCell>
                      <TableCell className="text-right font-mono text-destructive">
                        -{deficit.toFixed(1)}g
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Flagged castings section */}
      <Card className={cn(flaggedCastings && flaggedCastings.length > 0 && 'border-warning/30')}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Flag className={cn('h-4 w-4', flaggedCastings && flaggedCastings.length > 0 ? 'text-warning' : 'text-muted-foreground')} />
            Discrepancy Alerts
            {flaggedCastings && flaggedCastings.length > 0 && (
              <Badge className="ml-auto bg-warning text-warning-foreground">{flaggedCastings.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!flaggedCastings || flaggedCastings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No discrepancy alerts ✓</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Metal</TableHead>
                  <TableHead className="text-right">Extracted</TableHead>
                  <TableHead className="text-right">Discrepancy</TableHead>
                  <TableHead className="text-right">%</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flaggedCastings.map((c) => {
                  const mt = c.metal_types as any;
                  const dotClass = getMetalDotClass(mt?.color_group ?? '', mt?.metal_family ?? '');
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-bold text-sm">{c.casting_code}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className={cn('h-2 w-2 rounded-full', dotClass)} />
                          <span className="text-sm">{mt?.metal_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{Number(c.extracted_grams).toFixed(2)}g</TableCell>
                      <TableCell className="text-right font-mono text-sm text-destructive font-bold">
                        {Number(c.discrepancy_grams).toFixed(2)}g
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-destructive font-bold">
                        {Number(c.discrepancy_percent).toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.completed_at ? format(new Date(c.completed_at), 'MMM d, yyyy') : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
