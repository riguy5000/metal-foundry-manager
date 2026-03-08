import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { getMetalCardClass, getMetalEmoji } from '@/lib/metalUtils';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

const FAMILY_ORDER = ['Gold', 'Platinum', 'Palladium', 'Silver'];
const COLOR_ORDER = ['Yellow', 'White', 'Rose'];

interface MetalType {
  id: string;
  metal_name: string;
  metal_family: string;
  color_group: string;
  karat_label: string;
  current_stock_grams: number;
  minimum_threshold_grams: number;
  low_stock_warning_enabled: boolean;
  active_status: boolean;
  display_order: number;
}

function getFamilyIcon(family: string) {
  switch (family) {
    case 'Gold': return '🟡';
    case 'Platinum': return '⬜';
    case 'Palladium': return '🔘';
    case 'Silver': return '🪙';
    default: return '⚪';
  }
}

function getColorLabel(color: string) {
  switch (color.toLowerCase()) {
    case 'yellow': return 'Yellow Gold';
    case 'white': return 'White Gold';
    case 'rose':
    case 'red': return 'Rose Gold';
    default: return color + ' Gold';
  }
}

function normalizeColorGroup(color: string): string {
  // Group Red and Rose together under Rose
  if (color === 'Red') return 'Rose';
  return color;
}

function getShortName(metalName: string, colorGroup: string, metalFamily: string): string {
  if (metalFamily !== 'Gold') return metalName;
  // For gold: show "10K Yellow", "14K Red", etc.
  const karat = metalName.match(/^\d+K/)?.[0] ?? '';
  const color = (colorGroup === 'Red' || colorGroup === 'Rose') ? 'Red' : colorGroup;
  return `${karat} ${color}`;
}

export default function EmployeeHome() {
  const navigate = useNavigate();

  const { data: metals, isLoading } = useQuery({
    queryKey: ['metal_types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('metal_types')
        .select('*')
        .eq('active_status', true)
        .order('display_order');
      if (error) throw error;
      return data as MetalType[];
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const grouped = buildHierarchy(metals ?? []);

  return (
    <div className="p-4 pb-2">
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">Select Metal</h1>
        <p className="text-sm text-muted-foreground">Tap a metal to extract for casting</p>
      </div>

      <div className="space-y-8">
        {grouped.map((familyGroup) => (
          <div key={familyGroup.family}>
            {/* Family header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <span className="text-lg">{getFamilyIcon(familyGroup.family)}</span>
              <h2 className="text-lg font-bold tracking-tight">{familyGroup.family}</h2>
              <div className="flex-1 h-px bg-border ml-2" />
            </div>

            {familyGroup.family === 'Gold' ? (
              <div className="space-y-5">
                {familyGroup.colorGroups.map((colorGroup) => (
                  <div key={colorGroup.color}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                      {getColorLabel(colorGroup.color)}
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {colorGroup.metals.map((metal) => (
                        <MetalCard key={metal.id} metal={metal} onTap={() => navigate(`/employee/extract/${metal.id}`)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {familyGroup.metals.map((metal) => (
                  <MetalCard key={metal.id} metal={metal} onTap={() => navigate(`/employee/extract/${metal.id}`)} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function MetalCard({ metal, onTap }: { metal: MetalType; onTap: () => void }) {
  const lowStock = metal.low_stock_warning_enabled && metal.current_stock_grams < metal.minimum_threshold_grams;
  const cardClass = getMetalCardClass(metal.color_group, metal.metal_family);
  const emoji = getMetalEmoji(metal.color_group, metal.metal_family);
  const shortName = getShortName(metal.metal_name, metal.color_group, metal.metal_family);

  return (
    <button
      onClick={onTap}
      className={cn(
        'relative flex flex-col items-start rounded-xl p-4 text-left transition-all',
        'active:scale-[0.98] hover:shadow-md',
        'min-h-[120px] border',
        cardClass
      )}
    >
      {lowStock && (
        <Badge variant="destructive" className="absolute top-2 right-2 text-[10px] gap-1 px-1.5">
          <AlertTriangle className="h-3 w-3" />
          Low
        </Badge>
      )}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-base">{emoji}</span>
        <span className="text-sm font-semibold leading-tight text-foreground">
          {shortName}
        </span>
      </div>
      <div className="mt-auto w-full">
        <div className="flex items-baseline gap-0.5">
          <span className="font-mono text-2xl font-bold leading-none text-foreground">
            {Number(metal.current_stock_grams).toFixed(2)}
          </span>
          <span className="text-xs text-muted-foreground ml-0.5">g</span>
        </div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-2">
          EXTRACT &gt;
        </div>
      </div>
    </button>
  );
}

interface FamilyGroup {
  family: string;
  metals: MetalType[];
  colorGroups: { color: string; metals: MetalType[] }[];
}

function buildHierarchy(metals: MetalType[]): FamilyGroup[] {
  const familyMap: Record<string, MetalType[]> = {};
  for (const m of metals) {
    const f = m.metal_family || 'Other';
    if (!familyMap[f]) familyMap[f] = [];
    familyMap[f].push(m);
  }

  const result: FamilyGroup[] = [];
  const families = Object.keys(familyMap).sort((a, b) => {
    const ai = FAMILY_ORDER.indexOf(a);
    const bi = FAMILY_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const family of families) {
    const familyMetals = familyMap[family];
    if (family === 'Gold') {
      const colorMap: Record<string, MetalType[]> = {};
      for (const m of familyMetals) {
        const c = m.color_group || 'Other';
        if (!colorMap[c]) colorMap[c] = [];
        colorMap[c].push(m);
      }
      const colorGroups = Object.keys(colorMap)
        .sort((a, b) => {
          const ai = COLOR_ORDER.indexOf(a);
          const bi = COLOR_ORDER.indexOf(b);
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        })
        .map((color) => ({ color, metals: colorMap[color] }));
      result.push({ family, metals: familyMetals, colorGroups });
    } else {
      result.push({ family, metals: familyMetals, colorGroups: [] });
    }
  }

  return result;
}
