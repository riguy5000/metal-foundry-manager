import { supabase } from '@/integrations/supabase/client';

export const roundGrams = (value: number) => Math.round(value * 100) / 100;

export async function applyMetalStockDelta(metalTypeId: string, deltaGrams: number) {
  const delta = roundGrams(deltaGrams);
  if (delta === 0) return null;

  const { data: current, error: currentError } = await supabase
    .from('metal_types')
    .select('id, current_stock_grams')
    .eq('id', metalTypeId)
    .maybeSingle();

  if (currentError) throw currentError;
  if (!current) throw new Error('Unable to read current stock for this metal.');

  const nextStock = roundGrams(Number(current.current_stock_grams) + delta);
  if (nextStock < 0) throw new Error('Insufficient inventory stock.');

  const { data: updated, error: updateError } = await supabase
    .from('metal_types')
    .update({ current_stock_grams: nextStock })
    .eq('id', metalTypeId)
    .select('id, current_stock_grams')
    .maybeSingle();

  if (updateError) throw updateError;
  if (!updated) throw new Error('Stock update was blocked. Please try again.');

  return roundGrams(Number(updated.current_stock_grams));
}
