import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { format } from 'date-fns';
import { useState, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronRight, ArrowDown, ArrowUp, Minus, ChevronLeft as ChevLeft, ChevronRight as ChevRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const typeLabels: Record<string, string> = {
  initial_stock: 'Initial Stock',
  add_stock: 'Add Stock',
  extract_for_casting: 'Extract',
  return_from_casting: 'Return',
  manual_adjustment: 'Adjustment',
  sprue_transfer_from_open_casting: 'Sprue Transfer',
  transfer_from_open_casting_to_stock: 'Transfer to Stock',
};

const typeColors: Record<string, string> = {
  initial_stock: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300',
  add_stock: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300',
  extract_for_casting: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300',
  return_from_casting: 'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300',
  manual_adjustment: 'bg-muted text-foreground border-border',
  sprue_transfer_from_open_casting: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300',
  transfer_from_open_casting_to_stock: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300',
};

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

function getSignedChange(t: any): number {
  const grams = Number(t.grams);
  const type = t.transaction_type;
  if (type === 'extract_for_casting') return -grams;
  if (type === 'return_from_casting' || type === 'add_stock' || type === 'initial_stock' || type === 'transfer_from_open_casting_to_stock' || type === 'sprue_transfer_from_open_casting') return grams;
  if (type === 'manual_adjustment') {
    // If stock_after > stock_before it was positive
    if (t.stock_before_grams != null && t.stock_after_grams != null) {
      return Number(t.stock_after_grams) - Number(t.stock_before_grams);
    }
    return grams;
  }
  return grams;
}

const ROWS_PER_PAGE_OPTIONS = [25, 50, 100];

function usePagination<T>(items: T[], defaultPerPage = 25) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(defaultPerPage);
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safeP = Math.min(page, totalPages);
  const paginated = items.slice((safeP - 1) * perPage, safeP * perPage);
  const reset = useCallback(() => setPage(1), []);
  return { page: safeP, setPage, perPage, setPerPage, totalPages, paginated, total: items.length, reset };
}

function PaginationBar({ page, totalPages, total, perPage, setPage, setPerPage }: ReturnType<typeof usePagination>) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Rows:</span>
        <Select value={String(perPage)} onValueChange={(v) => { setPerPage(Number(v)); setPage(1); }}>
          <SelectTrigger className="h-8 w-[70px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ROWS_PER_PAGE_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="ml-2">{total} total</span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 w-8 p-0">
          <ChevLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm px-2">{page} / {totalPages}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="h-8 w-8 p-0">
          <ChevRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default function AdminLogs() {
  // Filters
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [filterMetal, setFilterMetal] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterCode, setFilterCode] = useState('');
  const [filterCastingStatus, setFilterCastingStatus] = useState('all');

  const { data: metals } = useQuery({
    queryKey: ['metal_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('metal_types').select('*').eq('active_status', true).order('display_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: transactions } = useQuery({
    queryKey: ['inventory_transactions_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select('*, metal_types(metal_name, karat_label)')
        .order('timestamp', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const { data: castings } = useQuery({
    queryKey: ['casting_records_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('casting_records')
        .select('*, metal_types(metal_name, karat_label), profiles:extracted_by_user_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const { data: auditLogs } = useQuery({
    queryKey: ['audit_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter((t) => {
      if (fromDate && t.timestamp < fromDate) return false;
      if (toDate && t.timestamp > toDate + 'T23:59:59') return false;
      if (filterMetal !== 'all' && t.metal_type_id !== filterMetal) return false;
      if (filterType !== 'all' && t.transaction_type !== filterType) return false;
      if (filterCode && !(t as any).related_casting_code?.toLowerCase().includes(filterCode.toLowerCase())) return false;
      return true;
    });
  }, [transactions, fromDate, toDate, filterMetal, filterType, filterCode]);

  const filteredCastings = useMemo(() => {
    if (!castings) return [];
    return castings.filter((c) => {
      if (fromDate && c.created_at < fromDate) return false;
      if (toDate && c.created_at > toDate + 'T23:59:59') return false;
      if (filterMetal !== 'all' && c.metal_type_id !== filterMetal) return false;
      if (filterCastingStatus !== 'all') {
        if (filterCastingStatus === 'pending' && c.status !== 'extracted_pending_completion') return false;
        if (filterCastingStatus === 'completed' && c.status !== 'completed') return false;
        if (filterCastingStatus === 'flagged' && c.status !== 'flagged') return false;
        if (filterCastingStatus === 'transfer' && c.status !== 'open_with_sprue_transfer') return false;
      }
      if (filterCode && !c.casting_code?.toLowerCase().includes(filterCode.toLowerCase())) return false;
      return true;
    });
  }, [castings, fromDate, toDate, filterMetal, filterCastingStatus, filterCode]);

  const filteredAudit = useMemo(() => auditLogs ?? [], [auditLogs]);

  const txPag = usePagination(filteredTransactions);
  const castPag = usePagination(filteredCastings);
  const auditPag = usePagination(filteredAudit);

  // Reset pages when filters change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemo(() => { txPag.reset(); castPag.reset(); auditPag.reset(); }, [fromDate, toDate, filterMetal, filterType, filterCode, filterCastingStatus]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Logs</h1>

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
              <Label className="text-xs text-muted-foreground">Casting Code</Label>
              <Input value={filterCode} onChange={(e) => setFilterCode(e.target.value)} placeholder="e.g. CST-" className="h-9 w-36" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Action Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(typeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Casting Status</Label>
              <Select value={filterCastingStatus} onValueChange={setFilterCastingStatus}>
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
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="transactions">
        <TabsList>
          <TabsTrigger value="transactions">Transactions ({filteredTransactions.length})</TabsTrigger>
          <TabsTrigger value="casting-summary">Casting Summary ({filteredCastings.length})</TabsTrigger>
          <TabsTrigger value="audit">Audit ({filteredAudit.length})</TabsTrigger>
        </TabsList>

        {/* ── TRANSACTIONS TAB ── */}
        <TabsContent value="transactions">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Metal</TableHead>
                    <TableHead>Flask Code</TableHead>
                    <TableHead className="text-right">Before</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="text-right">After</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txPag.paginated.map((t) => (
                    <TransactionRow key={t.id} t={t} />
                  ))}
                  {filteredTransactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center text-muted-foreground py-8">No transactions</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {filteredTransactions.length > 0 && <PaginationBar {...txPag} />}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── CASTING SUMMARY TAB ── */}
        <TabsContent value="casting-summary">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Metal</TableHead>
                    <TableHead className="text-right">Extracted</TableHead>
                    <TableHead className="text-right">Xfer to Stock</TableHead>
                    <TableHead className="text-right">Returned</TableHead>
                    <TableHead className="text-right">Jewelry</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Employee</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {castPag.paginated.map((c) => (
                    <CastingSummaryRow key={c.id} c={c} />
                  ))}
                  {filteredCastings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground py-8">No casting records</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {filteredCastings.length > 0 && <PaginationBar {...castPag} />}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── AUDIT TAB ── */}
        <TabsContent value="audit">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Entity ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditPag.paginated.map((log) => (
                    <AuditRow key={log.id} log={log} />
                  ))}
                  {filteredAudit.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No audit entries</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {filteredAudit.length > 0 && <PaginationBar {...auditPag} />}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Transaction Row with expandable detail ──
function TransactionRow({ t }: { t: any }) {
  const [open, setOpen] = useState(false);
  const signedChange = getSignedChange(t);
  const isPositive = signedChange > 0;
  const isNegative = signedChange < 0;
  const metalName = `${(t.metal_types as any)?.metal_name ?? ''} ${(t.metal_types as any)?.karat_label ?? ''}`.trim();

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <>
        <CollapsibleTrigger asChild>
          <TableRow className="cursor-pointer hover:bg-muted/50">
            <TableCell className="w-8 px-2">
              {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{format(new Date(t.timestamp), 'M/d/yy HH:mm')}</TableCell>
            <TableCell>
              <Badge variant="outline" className={cn('text-[10px]', typeColors[t.transaction_type] ?? '')}>
                {typeLabels[t.transaction_type] ?? t.transaction_type}
              </Badge>
            </TableCell>
            <TableCell className="text-sm">{metalName}</TableCell>
            <TableCell className="font-mono text-xs">{(t as any).related_casting_code ?? '—'}</TableCell>
            <TableCell className="text-right font-mono text-sm text-muted-foreground">
              {t.stock_before_grams != null ? Number(t.stock_before_grams).toFixed(2) : '—'}
            </TableCell>
            <TableCell className="text-right font-mono text-sm font-bold">
              <span className={cn(
                isPositive && 'text-green-600 dark:text-green-400',
                isNegative && 'text-red-600 dark:text-red-400',
              )}>
                <span className="inline-flex items-center gap-0.5">
                  {isPositive && <ArrowUp className="h-3 w-3" />}
                  {isNegative && <ArrowDown className="h-3 w-3" />}
                  {!isPositive && !isNegative && <Minus className="h-3 w-3" />}
                  {isPositive ? '+' : ''}{signedChange.toFixed(2)}
                </span>
              </span>
            </TableCell>
            <TableCell className="text-right font-mono text-sm text-muted-foreground">
              {t.stock_after_grams != null ? Number(t.stock_after_grams).toFixed(2) : '—'}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground truncate max-w-[120px]">{(t as any).performed_by_name ?? '—'}</TableCell>
            <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{t.notes ?? '—'}</TableCell>
          </TableRow>
        </CollapsibleTrigger>
        <CollapsibleContent asChild>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableCell colSpan={10} className="py-3 px-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Exact Time</span>
                  <p className="font-mono">{format(new Date(t.timestamp), 'MMM d, yyyy HH:mm:ss')}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">User</span>
                  <p>{(t as any).performed_by_name || '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Casting ID</span>
                  <p className="font-mono text-xs">{t.related_casting_id ?? '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Casting Code</span>
                  <p className="font-mono">{(t as any).related_casting_code ?? '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Stock Before</span>
                  <p className="font-mono">{t.stock_before_grams != null ? `${Number(t.stock_before_grams).toFixed(2)}g` : '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Stock After</span>
                  <p className="font-mono">{t.stock_after_grams != null ? `${Number(t.stock_after_grams).toFixed(2)}g` : '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Raw Grams</span>
                  <p className="font-mono">{Number(t.grams).toFixed(2)}g</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Transaction Type</span>
                  <p>{t.transaction_type}</p>
                </div>
                {t.notes && (
                  <div className="col-span-full">
                    <span className="text-muted-foreground text-xs">Full Notes</span>
                    <p>{t.notes}</p>
                  </div>
                )}
              </div>
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      </>
    </Collapsible>
  );
}

// ── Casting Summary Row with expandable detail ──
function CastingSummaryRow({ c }: { c: any }) {
  const [open, setOpen] = useState(false);
  const profile = c.profiles as any;
  const metalName = `${(c.metal_types as any)?.metal_name ?? ''} ${(c.metal_types as any)?.karat_label ?? ''}`.trim();
  const extracted = Number(c.extracted_grams);
  const transferred = Number(c.sprue_transferred_to_next_casting_grams ?? 0);
  const returned = Number(c.returned_button_grams ?? 0);
  const jewelry = Number(c.finished_jewelry_grams ?? 0);
  const isCompleted = c.status === 'completed' || c.status === 'flagged';
  const remaining = isCompleted ? 0 : extracted - transferred - returned - jewelry;
  const discrepancy = isCompleted ? Number(c.discrepancy_grams ?? 0) : null;

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <>
        <CollapsibleTrigger asChild>
          <TableRow className="cursor-pointer hover:bg-muted/50">
            <TableCell className="w-8 px-2">
              {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{format(new Date(c.created_at), 'M/d/yy')}</TableCell>
            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{c.completed_at ? format(new Date(c.completed_at), 'M/d/yy') : '—'}</TableCell>
            <TableCell className="font-mono text-sm font-medium">{c.casting_code}</TableCell>
            <TableCell className="text-sm">{metalName}</TableCell>
            <TableCell className="text-right font-mono text-sm font-bold">{extracted.toFixed(2)}</TableCell>
            <TableCell className="text-right font-mono text-sm">
              {transferred > 0 ? <span className="text-sky-600 dark:text-sky-400">{transferred.toFixed(2)}</span> : '—'}
            </TableCell>
            <TableCell className="text-right font-mono text-sm">{returned > 0 ? returned.toFixed(2) : '—'}</TableCell>
            <TableCell className="text-right font-mono text-sm">{jewelry > 0 ? jewelry.toFixed(2) : '—'}</TableCell>
            <TableCell className="text-right font-mono text-sm">
              {isCompleted ? (
                discrepancy !== null && Math.abs(discrepancy) > 0.01 ? (
                  <span className={cn('font-bold', discrepancy < -0.01 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400')}>
                    {discrepancy.toFixed(2)}
                  </span>
                ) : <span className="text-success">0.00</span>
              ) : (
                <span className="text-muted-foreground">{remaining.toFixed(2)}</span>
              )}
            </TableCell>
            <TableCell>
              <Badge variant="outline" className={cn('text-[10px]', statusColor(c.status))}>
                {statusLabel(c.status)}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{profile?.full_name ?? '—'}</TableCell>
          </TableRow>
        </CollapsibleTrigger>
        <CollapsibleContent asChild>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableCell colSpan={12} className="py-3 px-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Extracted</span>
                  <p className="font-mono font-bold">{extracted.toFixed(2)}g</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Transferred to Stock</span>
                  <p className="font-mono">{transferred.toFixed(2)}g</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Returned Button/Sprue</span>
                  <p className="font-mono">{returned.toFixed(2)}g</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Finished Jewelry</span>
                  <p className="font-mono">{jewelry.toFixed(2)}g</p>
                </div>
                {isCompleted && (
                  <>
                    <div>
                      <span className="text-muted-foreground text-xs">Discrepancy</span>
                      <p className={cn('font-mono font-bold', discrepancy && Math.abs(discrepancy) > 0.01 ? 'text-destructive' : 'text-success')}>
                        {discrepancy?.toFixed(2)}g ({Number(c.discrepancy_percent ?? 0).toFixed(1)}%)
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Tolerance Used</span>
                      <p className="font-mono">{Number(c.tolerance_percent_used ?? 0).toFixed(1)}%</p>
                    </div>
                  </>
                )}
                <div>
                  <span className="text-muted-foreground text-xs">Created At</span>
                  <p className="font-mono text-xs">{format(new Date(c.created_at), 'MMM d, yyyy HH:mm:ss')}</p>
                </div>
                {c.completed_at && (
                  <div>
                    <span className="text-muted-foreground text-xs">Completed At</span>
                    <p className="font-mono text-xs">{format(new Date(c.completed_at), 'MMM d, yyyy HH:mm:ss')}</p>
                  </div>
                )}
                {c.job_reference && (
                  <div>
                    <span className="text-muted-foreground text-xs">Job Reference</span>
                    <p>{c.job_reference}</p>
                  </div>
                )}
                {c.abnormality_note && (
                  <div className="col-span-full">
                    <span className="text-muted-foreground text-xs">Abnormality Note</span>
                    <p>{c.abnormality_note}</p>
                  </div>
                )}
                {c.notes && (
                  <div className="col-span-full">
                    <span className="text-muted-foreground text-xs">Notes</span>
                    <p>{c.notes}</p>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground text-xs">Formula</span>
                  <p className="font-mono text-xs">
                    {extracted.toFixed(2)} − {transferred.toFixed(2)} − {returned.toFixed(2)} − {jewelry.toFixed(2)} = {(extracted - transferred - returned - jewelry).toFixed(2)}g
                  </p>
                </div>
              </div>
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      </>
    </Collapsible>
  );
}

// ── Audit Row with expandable detail ──
function AuditRow({ log }: { log: any }) {
  const [open, setOpen] = useState(false);
  const hasBefore = log.before_json && Object.keys(log.before_json).length > 0;
  const hasAfter = log.after_json && Object.keys(log.after_json).length > 0;

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <>
        <CollapsibleTrigger asChild>
          <TableRow className="cursor-pointer hover:bg-muted/50">
            <TableCell className="w-8 px-2">
              {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{format(new Date(log.timestamp), 'M/d/yy HH:mm:ss')}</TableCell>
            <TableCell className="font-medium text-sm">{log.action_type}</TableCell>
            <TableCell className="text-sm">{log.entity_type}</TableCell>
            <TableCell className="font-mono text-xs">{log.entity_id ?? '—'}</TableCell>
          </TableRow>
        </CollapsibleTrigger>
        <CollapsibleContent asChild>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableCell colSpan={5} className="py-3 px-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                {hasBefore && (
                  <div>
                    <span className="text-muted-foreground text-xs font-medium">Before</span>
                    <pre className="font-mono text-xs bg-background rounded p-2 mt-1 overflow-auto max-h-40">{JSON.stringify(log.before_json, null, 2)}</pre>
                  </div>
                )}
                {hasAfter && (
                  <div>
                    <span className="text-muted-foreground text-xs font-medium">After</span>
                    <pre className="font-mono text-xs bg-background rounded p-2 mt-1 overflow-auto max-h-40">{JSON.stringify(log.after_json, null, 2)}</pre>
                  </div>
                )}
                {!hasBefore && !hasAfter && (
                  <p className="text-muted-foreground text-xs">No additional detail recorded.</p>
                )}
                <div>
                  <span className="text-muted-foreground text-xs">User ID</span>
                  <p className="font-mono text-xs">{log.user_id ?? '—'}</p>
                </div>
              </div>
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      </>
    </Collapsible>
  );
}
