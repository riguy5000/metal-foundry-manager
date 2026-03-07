import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const CHART_COLORS = [
  'hsl(43, 76%, 56%)', 'hsl(220, 12%, 62%)', 'hsl(12, 55%, 58%)',
  'hsl(0, 62%, 50%)', 'hsl(220, 8%, 52%)', 'hsl(200, 6%, 56%)',
  'hsl(210, 6%, 68%)', 'hsl(152, 55%, 42%)',
];

export default function AdminStatistics() {
  const { data: metals } = useQuery({
    queryKey: ['metal_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('metal_types').select('*').eq('active_status', true).order('display_order');
      if (error) throw error;
      return data;
    },
  });

  const { data: castings } = useQuery({
    queryKey: ['all_castings_stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('casting_records')
        .select('*, metal_types(metal_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Stock by metal family
  const familyStock: Record<string, number> = {};
  metals?.forEach((m) => {
    const f = m.metal_family || 'Other';
    familyStock[f] = (familyStock[f] || 0) + Number(m.current_stock_grams);
  });
  const familyData = Object.entries(familyStock).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));

  // Usage by metal (top 10 by extracted grams)
  const metalUsage: Record<string, number> = {};
  castings?.forEach((c) => {
    const name = (c.metal_types as any)?.metal_name || 'Unknown';
    metalUsage[name] = (metalUsage[name] || 0) + Number(c.extracted_grams);
  });
  const usageData = Object.entries(metalUsage)
    .map(([name, grams]) => ({ name: name.length > 16 ? name.slice(0, 16) + '…' : name, grams: Math.round(grams * 100) / 100 }))
    .sort((a, b) => b.grams - a.grams)
    .slice(0, 10);

  // Castings by status
  const statusCount: Record<string, number> = {};
  castings?.forEach((c) => {
    statusCount[c.status] = (statusCount[c.status] || 0) + 1;
  });
  const statusData = Object.entries(statusCount).map(([name, value]) => ({
    name: name === 'extracted_pending_completion' ? 'Pending' : name === 'completed' ? 'Completed' : 'Flagged',
    value,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Statistics</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Stock by Metal Family</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={familyData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}g`}>
                  {familyData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Casting Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
                  <Cell fill="hsl(152, 55%, 42%)" />
                  <Cell fill="hsl(38, 92%, 50%)" />
                  <Cell fill="hsl(0, 72%, 51%)" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Metals by Usage (grams extracted)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={usageData} margin={{ left: 0, right: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 88%)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={80} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="grams" fill="hsl(38, 60%, 52%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
