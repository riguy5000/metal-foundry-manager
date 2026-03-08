import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Package, FlaskConical, AlertTriangle, Flag, Clock, Timer } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format, differenceInHours } from 'date-fns';
import { useNavigate } from 'react-router-dom';
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
        .select('*, metal_types(metal_name, karat_label, color_group, metal_family), profiles:extracted_by_user_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(50);
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

  // Aging castings: pending for 2+ hours
  const agingCastings = pendingCastings.filter((c) => {
    const hours = differenceInHours(new Date(), new Date(c.extracted_at));
    return hours >= 2;
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      {/* Warning alerts at top — impossible to miss */}
      <div className="space-y-3">
        {lowStockMetals.length > 0 && (
          <div
            className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4 cursor-pointer hover:bg-destructive/10 transition-colors"
            onClick={() => navigate('/admin/warnings')}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-destructive">Low Stock Alert</span>
                <span className="text-sm text-muted-foreground ml-2">
                  {lowStockMetals.map(m => m.metal_name).join(', ')} — below threshold
                </span>
              </div>
              <Badge variant="destructive" className="shrink-0">{lowStockMetals.length}</Badge>
            </div>
          </div>
        )}

        {flaggedCastings.length > 0 && (
          <div
            className="flex items-center gap-3 rounded-xl border-2 border-destructive/30 bg-destructive/5 p-4 cursor-pointer hover:bg-destructive/10 transition-colors"
            onClick={() => navigate('/admin/warnings')}
          >
            <Flag className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1">
              <span className="font-semibold text-destructive">Discrepancy Alerts</span>
              <span className="text-sm text-muted-foreground ml-2">{flaggedCastings.length} castings flagged for high discrepancy</span>
            </div>
            <Badge variant="destructive" className="shrink-0">{flaggedCastings.length}</Badge>
          </div>
        )}

        {agingCastings.length > 0 && (
          <div
            className="flex items-center gap-3 rounded-xl border-2 border-warning/30 bg-warning/5 p-4 cursor-pointer hover:bg-warning/10 transition-colors"
            onClick={() => navigate('/admin/castings')}
          >
            <Timer className="h-5 w-5 text-warning shrink-0" />
            <div className="flex-1">
              <span className="font-semibold text-warning">Aging Castings</span>
              <span className="text-sm text-muted-foreground ml-2">{agingCastings.length} castings open longer than expected</span>
            </div>
            <Badge variant="outline" className="border-warning/30 text-warning shrink-0">{agingCastings.length}</Badge>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/admin/inventory')}>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Metals Tracked</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{activeMetals.length}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/admin/inventory')}>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Stock</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalStockGrams.toFixed(0)}g</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/admin/castings')}>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pending</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{pendingCastings.length}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/admin/warnings')}>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Flagged</CardTitle>
            <Flag className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className={cn('text-3xl font-bold', flaggedCastings.length > 0 && 'text-destructive')}>{flaggedCastings.length}</div>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/admin/warnings')}>
          <CardHeader className="flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Low Stock</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className={cn('text-3xl font-bold', lowStockMetals.length > 0 && 'text-warning')}>{lowStockMetals.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Aging & Overdue Castings table */}
      {agingCastings.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Timer className="h-4 w-4 text-warning" />
              Aging & Overdue Castings
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Metal</TableHead>
                  <TableHead className="text-right">Grams</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Extracted By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agingCastings.map((c) => {
                  const mt = c.metal_types as any;
                  const hours = differenceInHours(new Date(), new Date(c.extracted_at));
                  const profile = c.profiles as any;
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Badge className="bg-warning/10 text-warning border-warning/30 text-xs" variant="outline">Aging</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{c.casting_code}</TableCell>
                      <TableCell className="text-sm">{mt?.metal_name}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{Number(c.extracted_grams).toFixed(2)}</TableCell>
                      <TableCell className="text-sm">{hours}h — Aging</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {profile?.full_name ?? '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
