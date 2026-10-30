export interface SweepCasting {
  id: string;
  extracted_grams: number;
  sprue_transferred_to_next_casting_grams?: number;
  finished_jewelry_grams?: number | null;
  returned_button_grams?: number | null;
}

const round = (value: number) => Math.round(value * 100) / 100;

export function reconcileSweeps(casting: SweepCasting, credited = 0) {
  const original = round(Number(casting.extracted_grams) - Number(casting.sprue_transferred_to_next_casting_grams ?? 0)
    - Number(casting.finished_jewelry_grams ?? 0) - Number(casting.returned_button_grams ?? 0));
  const remaining = round(original - credited);
  const percent = Number(casting.extracted_grams) > 0 ? Math.abs(remaining) / Number(casting.extracted_grams) * 100 : 0;
  return { original, credited, remaining, percent };
}

// Integer hundredths and largest remainders match the receipt function in Postgres.
export function allocateSweeps(losses: { id: string; grams: number }[], bagGrams: number) {
  const positive = losses.map(l => ({ id: l.id, cents: Math.max(0, Math.round(l.grams * 100)) })).filter(l => l.cents > 0);
  const total = positive.reduce((sum, l) => sum + l.cents, 0);
  const credit = Math.min(Math.max(0, Math.round(bagGrams * 100)), total);
  if (!total) return { allocations: [] as { id: string; grams: number }[], excess: round(bagGrams) };
  const shares = positive.map(l => ({ id: l.id, base: Math.floor(credit * l.cents / total), remainder: (credit * l.cents) % total }));
  let extra = credit - shares.reduce((sum, s) => sum + s.base, 0);
  shares.sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
  const allocations = shares.map(s => ({ id: s.id, grams: (s.base + (extra-- > 0 ? 1 : 0)) / 100 }));
  return { allocations, excess: round(bagGrams - credit / 100) };
}