

## What Happened and Recovery Plan

### What happened

1. Your Metal CRM (cast-care-vault) was working in Lovable's preview but the **published URL** was stuck showing a blank page.
2. The plan file suggested creating a **Remix** to bypass the stuck publish state.
3. The remix created a copy, but the copy started from the blank template — it did not carry over your CRM frontend code.
4. Meanwhile, the GitHub repo only ever received **plan file updates and config changes** — the actual React components (pages, forms, dashboard, auth) were never committed to GitHub. Every commit in the repo history is either the initial template, plan updates, or config syncs.
5. The "Revert" attempts then pushed the blank template state back, overwriting any remaining snapshot.

**Bottom line**: The CRM frontend code is lost from both Lovable's state and GitHub. However, your **entire backend database is intact** — all tables, data, RLS policies, and functions are untouched.

### What is still intact

Your database has all of these tables with real data:
- **metal_types** (19 rows) — all your metals with karat labels, stock levels, thresholds
- **casting_records** (9 rows) — casting codes, extracted grams, discrepancy tracking
- **inventory_transactions** — stock movements and adjustments
- **audit_logs** — action history
- **profiles** — user profiles
- **user_roles** — admin/employee roles
- **settings** — discrepancy tolerance, warning flags
- **metal_threshold_overrides** — per-metal minimum thresholds

Also, partial CRM code exists in the [casting-process-compass](/projects/283039ff-c6be-4cb1-9bad-99e44103bad0) project (casting form, image uploads, process history).

### Recovery Plan: Rebuild the Frontend

Since the database schema and data are fully intact, I will rebuild the entire Metal CRM frontend to match the existing tables. Here is what I will build:

**1. Authentication**
- Login page with email/password
- Auth guard for protected routes
- Role-based access (admin vs employee) using existing `user_roles` table and `has_role()` function

**2. Admin Dashboard**
- Overview cards: total metal types, active castings, low-stock alerts
- Recent casting records table
- Quick-action buttons

**3. Metal Inventory Management**
- Table of all metal types with current stock, karat label, metal family, color group
- Add/edit metal type form
- Stock adjustment (add stock, manual adjustment) creating `inventory_transactions`
- Low-stock warnings based on thresholds from `metal_threshold_overrides`

**4. Casting Records**
- List of all casting records with status badges (extracted_pending_completion, completed, flagged)
- New casting form: select metal type, enter extracted grams, job reference
- Completion form: enter returned button grams, finished jewelry grams, auto-calculate discrepancy
- Discrepancy flagging with notes

**5. Inventory Transaction Log**
- Filterable history of all inventory movements
- Links to related casting records

**6. Audit Log Viewer**
- Read-only table of all audit_logs entries

**7. Settings Page (admin only)**
- Default discrepancy tolerance
- Warning toggles
- Per-metal threshold overrides

### Technical approach
- All pages use the existing database tables and RLS policies — no database changes needed
- Uses existing `supabase` client from `src/integrations/supabase/client.ts`
- React Router for navigation, TanStack Query for data fetching
- Tailwind + shadcn/ui components (already installed)

