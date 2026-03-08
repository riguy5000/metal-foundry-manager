import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format } from 'date-fns';

const typeLabels: Record<string, string> = {
  initial_stock: 'Initial Stock',
  add_stock: 'Add Stock',
  extract_for_casting: 'Extract',
  return_from_casting: 'Return',
  manual_adjustment: 'Adjustment',
};

const typeColors: Record<string, string> = {
  initial_stock: 'bg-blue-100 text-blue-800 border-blue-200',
  add_stock: 'bg-green-100 text-green-800 border-green-200',
  extract_for_casting: 'bg-amber-100 text-amber-800 border-amber-200',
  return_from_casting: 'bg-purple-100 text-purple-800 border-purple-200',
  manual_adjustment: 'bg-gray-100 text-gray-800 border-gray-200',
};

export default function AdminLogs() {
  const { data: transactions } = useQuery({
    queryKey: ['inventory_transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select('*, metal_types(metal_name, karat_label)')
        .order('timestamp', { ascending: false });
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
        .order('timestamp', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Logs</h1>
      <Tabs defaultValue="transactions">
        <TabsList>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Metal</TableHead>
                    <TableHead className="text-right">Grams</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions?.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-muted-foreground">{format(new Date(t.timestamp), 'MMM d, yyyy HH:mm')}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={typeColors[t.transaction_type] ?? ''}>
                          {typeLabels[t.transaction_type] ?? t.transaction_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{(t.metal_types as any)?.metal_name} {(t.metal_types as any)?.karat_label}</TableCell>
                      <TableCell className="text-right font-mono">{Number(t.grams).toFixed(2)}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">{t.notes ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                  {(!transactions || transactions.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">No transactions</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Entity ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs?.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground">{format(new Date(log.timestamp), 'MMM d, yyyy HH:mm:ss')}</TableCell>
                      <TableCell className="font-medium">{log.action_type}</TableCell>
                      <TableCell>{log.entity_type}</TableCell>
                      <TableCell className="font-mono text-xs">{log.entity_id ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                  {(!auditLogs || auditLogs.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">No audit entries</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
