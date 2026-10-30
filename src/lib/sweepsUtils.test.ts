import { describe, expect, it } from 'vitest';
import { allocateSweeps, reconcileSweeps } from './sweepsUtils';

describe('sweeps reconciliation', () => {
  it('balances losses of 1g, 2g and 3g with one 6g bag', () => {
    const result = allocateSweeps([{ id: 'a', grams: 1 }, { id: 'b', grams: 2 }, { id: 'c', grams: 3 }], 6);
    expect(Object.fromEntries(result.allocations.map(a => [a.id, a.grams]))).toEqual({ a: 1, b: 2, c: 3 });
    expect(result.excess).toBe(0);
  });
  it('credits partial bags proportionally without losing hundredths', () => {
    const result = allocateSweeps([{ id: 'a', grams: 1 }, { id: 'b', grams: 2 }, { id: 'c', grams: 3 }], 1);
    expect(Object.fromEntries(result.allocations.map(a => [a.id, a.grams]))).toEqual({ a: 0.17, b: 0.33, c: 0.5 });
  });
  it('keeps original loss until a later receipt is credited', () => {
    const casting = { id: 'a', extracted_grams: 50, returned_button_grams: 30, finished_jewelry_grams: 18 };
    expect(reconcileSweeps(casting)).toEqual({ original: 2, credited: 0, remaining: 2, percent: 4 });
    expect(reconcileSweeps(casting, 2)).toEqual({ original: 2, credited: 2, remaining: 0, percent: 0 });
  });
  it('keeps excess bag weight unallocated rather than creating negative loss', () => {
    expect(allocateSweeps([{ id: 'a', grams: 1 }], 3)).toEqual({ allocations: [{ id: 'a', grams: 1 }], excess: 2 });
  });
  it('subtracts existing transfers, returns and jewelry only once', () => {
    expect(reconcileSweeps({ id: 'a', extracted_grams: 50, sprue_transferred_to_next_casting_grams: 10, returned_button_grams: 20, finished_jewelry_grams: 17 }, 2).remaining).toBe(1);
  });
});