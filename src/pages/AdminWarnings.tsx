import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Flag } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { getMetalDotClass } from '@/lib/metalUtils';
import { cn } from '@/lib/utils';

function getSeverity(current: number, threshold: number) {
  if (current <= 0) return { label: 'Critical', className: 'bg-destructive text-destructive-foreground' };
  const ratio = current / threshold;
  if (ratio < 0.5) return { label: 'Warning', className: 'bg-warning/20 text-warning border-warning/30' };
  return { label: 'Low', className: 'bg-muted text-foreground' };
}

export default function AdminWarnings() {
  const { data: metals } = useQuery({
    queryKey: ['metal_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('metal_types').select('*').order('current_stock_grams', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: flaggedCastings } = useQuery({
    queryKey: ['flagged_castings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('casting_records')
        .select('*, metal_types(metal_name, karat_label, color_group, metal_family), profiles:extracted_by_user_id(full_name)')
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
      <h1 className="text-2xl font-bold tracking-tight">Warnings</h1>

      <div className="grid gap-6 lg:grid-cols-2">
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
          <CardContent className="p-0">
            {lowStockMetals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">All metals above minimum threshold ✓</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metal</TableHead>
                    <TableHead className="text-right">Current (g)</TableHead>
                    <TableHead className="text-right">Threshold (g)</TableHead>
                    <TableHead>Severity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockMetals.map((m) => {
                    const severity = getSeverity(Number(m.current_stock_grams), Number(m.minimum_threshold_grams));
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium">{m.metal_name}</TableCell>
                        <TableCell className="text-right font-mono text-destructive font-bold">
                          {Number(m.current_stock_grams).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {Number(m.minimum_threshold_grams).toFixed(0)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('text-xs', severity.className)}>
                            {severity.label}
                          </Badge>
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
        <Card className={cn(flaggedCastings && flaggedCastings.length > 0 && 'border-destructive/30')}>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Flag className={cn('h-4 w-4', flaggedCastings && flaggedCastings.length > 0 ? 'text-destructive' : 'text-muted-foreground')} />
              Discrepancy Alerts
              {flaggedCastings && flaggedCastings.length > 0 && (
                <Badge variant="destructive" className="ml-auto">{flaggedCastings.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!flaggedCastings || flaggedCastings.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No discrepancy alerts ✓</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Metal</TableHead>
                    <TableHead className="text-right">Disc. %</TableHead>
                    <TableHead className="text-right">Lost (g)</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {flaggedCastings.map((c) => {
                    const mt = c.metal_types as any;
                    const profile = c.profiles as any;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-sm">{c.casting_code}</TableCell>
                        <TableCell className="text-sm">{mt?.metal_name}</TableCell>
                        <TableCell className="text-right font-mono text-sm text-destructive font-bold">
                          {Number(c.discrepancy_percent).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {Number(c.discrepancy_grams).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-sm">{profile?.full_name ?? '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {c.completed_at ? format(new Date(c.completed_at), 'M/d/yy') : '—'}
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
    </div>
  );
}
