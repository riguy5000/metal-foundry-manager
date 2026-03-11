
I found the root problem.

What’s happening
- The Platinum stock in the backend is currently still `88.36g`.
- The two latest Platinum castings are still in the database, but both were saved with:
  - `source_from_inventory_grams = 0`
  - `source_from_open_casting_grams = 0`
- That is wrong, because those fields should describe where the flask metal came from and drive the reversal math later.

Why you still see 88.36g
- The system thinks those two castings did not consume any inventory source at all.
- So the stock row for Platinum was never reduced correctly for those records.
- Because the stock never moved down properly, the UI keeps showing the original `88.36g`.

Why this is causing all the math issues
- Delete/reversal logic depends on `source_from_inventory_grams`.
- Completion/discrepancy logic depends on `sprue_transferred_to_next_casting_grams`.
- But the latest Platinum records are inconsistent:
  - transactions exist for extraction/transfer/return
  - the casting rows themselves say both source amounts are `0`
- So the ledger and the casting record are out of sync.

What I will fix
1. Fix casting creation so every new flask always stores the correct source split:
   - inventory grams
   - reused/open-casting grams
2. Fix stock updates so creation, transfer, completion, and deletion all use the same source-of-truth math.
3. Add safer reconciliation when deleting a casting that:
   - restores only true inventory consumption
   - does not double-count transferred sprue
   - respects returned button already added back
4. Backfill/repair the inconsistent recent Platinum records so the current stock becomes correct again.

Technical details
- The bad state is visible in the latest Platinum `casting_records`: both records have `source_from_inventory_grams = 0` and `source_from_open_casting_grams = 0`.
- Your current admin/employee logic already uses these fields in several places, so when they are wrong, every later adjustment becomes wrong too.
- I will focus on:
  - `src/pages/CastingRecords.tsx`
  - `src/pages/employee/EmployeeExtract.tsx`
  - any matching completion/delete paths that rely on the same fields
- I’ll make the math consistent around this rule:

```text
Inventory stock changes only when:
- metal is taken from inventory
- sprue/button is physically returned to inventory
- transferred-out sprue is explicitly made available again

Inventory stock does NOT change just because a casting row exists.
```

Expected result after fix
- If you start at `88.36g`, create/transfer/create/complete/delete, the inventory will move exactly according to the real source amounts and end in the correct number instead of staying stuck at `88.36`.
