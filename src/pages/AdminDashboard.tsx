import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, FlaskConical, AlertTriangle, Flag } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { getMetalDotClass } from '@/lib/metalUtils';
import { cn } from '@/lib/utils';

export default function AdminDashboard() {
  const navigate = useNavigate();

  const { data: metals } = useQuery({
    queryKey: ['metal_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('metal_types').select('*').order('display_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: castings } = useQuery({
    queryKey: ['casting_records_recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('casting_records')
        .select('*, metal_types(metal_name, karat_label, color_group, metal_family)')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const activeMetals = metals?.filter((m) => m.active_status) ?? [];
  const lowStockMetals = activeMetals.filter(
    (m) => m.low_stock_warning_enabled && m.current_stock_grams < m.minimum_threshold_grams
  );
  const pendingCastings = castings?.filter((c) => c.status === 'extracted_pending_completion') ?? [];
  const flaggedCastings = castings?.filter((c) => c.status === 'flagged') ?? [];

  const totalStockGrams = activeMetals.reduce((sum, m) => sum + Number(m.current_stock_grams), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      {/* Warning alerts at top — impossible to miss */}
      {(lowStockMetals.length > 0 || flaggedCastings.length > 0) && (
        <div className="space-y-3">
          {lowStockMetals.length > 0 && (
            <div
              className="flex items-start gap-3 rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4 cursor-pointer hover:bg-destructive/10 transition-colors"
              onClick={() => navigate('/admin/warnings')}
            >
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-destructive">
                  {lowStockMetals.length} Metal{lowStockMetals.length > 1 ? 's' : ''} Below Minimum Stock
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {lowStockMetals.map((m) => (
                    <Badge key={m.id} variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                      {m.metal_name} — {Number(m.current_stock_grams).toFixed(1)}g / {Number(m.minimum_threshold_grams).toFixed(0)}g min
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          {flaggedCastings.length > 0 && (
            <div
              className="flex items-start gap-3 rounded-xl border-2 border-warning/30 bg-warning/5 p-4 cursor-pointer hover:bg-warning/10 transition-colors"
              onClick={() => navigate('/admin/warnings')}
            >
              <Flag className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-warning">
                  {flaggedCastings.length} Flagged Casting{flaggedCastings.length > 1 ? 's' : ''} — Discrepancy Exceeded
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/admin/inventory')}>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Metals</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeMetals.length}</div>
            <p className="text-xs text-muted-foreground mt-1">{totalStockGrams.toFixed(0)}g total stock</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/admin/castings')}>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pending</CardTitle>
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{pendingCastings.length}</div>
            <p className="text-xs text-muted-foreground mt-1">awaiting completion</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/admin/warnings')}>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Low Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className={cn('text-3xl font-bold', lowStockMetals.length > 0 && 'text-destructive')}>{lowStockMetals.length}</div>
            <p className="text-xs text-muted-foreground mt-1">below threshold</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/admin/warnings')}>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Flagged</CardTitle>
            <Flag className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className={cn('text-3xl font-bold', flaggedCastings.length > 0 && 'text-warning')}>{flaggedCastings.length}</div>
            <p className="text-xs text-muted-foreground mt-1">discrepancy alerts</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent castings table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Castings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Metal</TableHead>
                <TableHead className="text-right">Extracted</TableHead>
                <TableHead className="text-right">Discrepancy</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {castings?.map((c) => {
                const mt = c.metal_types as any;
                const dotClass = getMetalDotClass(mt?.color_group ?? '', mt?.metal_family ?? '');
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-medium text-sm">{c.casting_code}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className={cn('h-2 w-2 rounded-full', dotClass)} />
                        <span className="text-sm">{mt?.metal_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{Number(c.extracted_grams).toFixed(2)}g</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {c.discrepancy_percent != null ? (
                        <span className={cn(
                          Math.abs(Number(c.discrepancy_percent)) > 2 ? 'text-destructive font-bold' : 'text-muted-foreground'
                        )}>
                          {Number(c.discrepancy_percent).toFixed(2)}%
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn(
                        'text-[10px]',
                        c.status === 'completed' && 'bg-success/10 text-success border-success/20',
                        c.status === 'flagged' && 'bg-destructive/10 text-destructive border-destructive/20',
                        c.status === 'extracted_pending_completion' && 'bg-warning/10 text-warning border-warning/20',
                      )}>
                        {c.status === 'extracted_pending_completion' ? 'pending' : c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(c.created_at), 'MMM d, yyyy')}
                    </TableCell>
                  </TableRow>
                );
              })}
              {(!castings || castings.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No casting records</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
