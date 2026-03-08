

## Plan: Group Inventory Table by Karat Grade

### What changes

Reorganize the inventory table on `/admin/inventory` so metals are grouped under section headers by karat/grade: **10K**, **14K**, **18K**, **19K**, **20K**, **22K**, **24K**, **Platinum**, **Palladium**, **Silver**.

### How

In `src/pages/MetalInventory.tsx`, after fetching `metals`, group them by `karat_label` (falling back to `metal_family` for non-gold metals like Platinum, Palladium, Silver):

1. **Group logic** — Create a helper that buckets metals into ordered groups:
   - `10K`, `14K`, `18K`, `19K`, `20K`, `22K`, `24K` (from `karat_label`)
   - `Platinum`, `Palladium`, `Silver` (from `metal_family` when `karat_label` is empty)

2. **Render grouped sections** — Instead of a single flat table, render one section per group with:
   - A sticky/bold section header row spanning all columns (e.g. "10 Karat", "14 Karat", "Platinum")
   - The metal rows underneath, same columns as today

3. **Keep all existing functionality** — Add Stock, Adjust, Threshold, Clock buttons remain unchanged per row.

### Technical detail

- Group key: `metal.karat_label || metal.metal_family`
- Sort order: numeric karat ascending, then non-gold families in current display_order
- Section header rendered as a `<TableRow>` with a single `<TableCell colSpan={6}>` containing the group name styled as a subheading
- Inactive metals (like 14K Russian Red) still shown but with their existing "Inactive" badge

