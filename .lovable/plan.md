# Blueprint Deliverable Plan

Generate a complete technical blueprint of this Metal Casting Inventory CRM as **two artifacts** in `/mnt/documents/`:
- `metal-casting-crm-blueprint.md`
- `metal-casting-crm-blueprint.pdf`

The blueprint will be self-contained and detailed enough to rebuild this CRM from scratch in another project.

## Document structure (sections)

1. **Overview & Purpose** — what the CRM does, who uses it (admin / employee), 0.01g precision rule.
2. **Tech Stack** — React 18 + Vite 5 + TypeScript + Tailwind + shadcn/ui + TanStack Query + React Router + Supabase (Auth, Postgres, RLS).
3. **Database Schema** — every table (`metal_types`, `casting_records`, `inventory_transactions`, `audit_logs`, `metal_threshold_overrides`, `settings`, `profiles`, `user_roles`) with full column lists, types, defaults, enums (`app_role`, `casting_status`, `transaction_type`).
4. **Row-Level Security** — every policy on every table, in plain English + the SQL.
5. **Database Functions & Triggers** — `has_role`, `handle_new_user`, `update_updated_at_column`, `enforce_metal_types_stock_only_update`.
6. **Auth & Roles** — separate `user_roles` table pattern, admin vs employee, `AuthProvider`, `AuthGuard`.
7. **Routing Map** — every admin route (`/admin/inventory`, `/castings`, `/warnings`, `/transactions`, `/statistics`, `/users`, `/audit`, `/logs`, `/settings`) and employee route (`/employee`, `/extract/:metalId`, `/pending`, `/complete/:castingId`, `/recent`).
8. **Page-by-Page Spec** — for each page: purpose, data queries, mutations, key UI elements, role required.
9. **Core Business Logic** — the heart of the system:
   - Extraction: deduct from stock, create casting, log transaction with stock_before/after.
   - Sprue/transfer-back-to-stock from open casting (before completion).
   - Final completion: returned button + finished jewelry, discrepancy formula.
   - Admin adjust/delete with full inventory reversal.
   - Discrepancy formula: `extracted − (returned + jewelry + transferred)`, flagged if `|diff|/extracted × 100 > tolerance`.
10. **Inventory Delta Helper** — `applyMetalStockDelta` source code and contract.
11. **Logging & Audit System** — every transaction records `stock_before_grams`, `stock_after_grams`, `related_casting_code`, `performed_by_name`. Audit log JSON before/after snapshots. AdminLogs page tabs (Transactions / Casting Summary / Audit) with pagination.
12. **Metal Type System** — `metal_family` (Gold/Silver/Platinum/Palladium), `color_group` (Yellow/White/Rose/Red), karat labels, dot/card color mapping, `getMetalCardClass`, `getMetalDotClass`, `getMetalEmoji`.
13. **Flask Code Generator** — `CST-YYYYMMDD-XXXX` format.
14. **UI / Design System** — semantic HSL tokens, metal color tokens, tablet-friendly layouts, shadcn components used.
15. **Configuration & Settings** — `settings` table (default tolerance %, low stock warnings toggle, discrepancy warnings toggle), per-metal threshold overrides.
16. **Full SQL Migration** — single ready-to-run SQL file recreating: enums, all tables, RLS, functions, triggers, `handle_new_user` hook on `auth.users`. Drop-in for a fresh Supabase project.
17. **Rebuild Checklist** — ordered step list for recreating in a new Lovable project.
18. **Appendix** — file tree, key TypeScript types, formula reference card.

## Generation approach

1. Write a Python script in `/tmp/` that builds the markdown content as a string (assembled from the codebase facts I've already gathered).
2. Save to `/mnt/documents/metal-casting-crm-blueprint.md`.
3. Convert to PDF via ReportLab using a clean styled layout (Heading1/2/3, monospace code blocks, tables for schema columns).
4. QA: render PDF pages to images and visually verify (no overflow, readable code blocks, proper page breaks).
5. Emit two `<lov-artifact>` tags so you can download both files.

## Out of scope

- No code changes to the project itself.
- No new migrations applied to the live database (the SQL inside the blueprint is a copy-paste artifact, not executed here).
