

## Add Activity Log to Admin Navigation

The project already has two log pages — **Transaction Log** (`/admin/transactions`) and **Audit Log** (`/admin/audit`) — with working routes, but neither is accessible from the sidebar.

### Plan

**1. Add a "Logs" nav link to the admin sidebar** (`src/components/AdminLayout.tsx`)
- Add a new entry to the `navLinks` array using the `FileText` icon (already imported) pointing to `/admin/logs`
- Place it after "Users" in the navigation order

**2. Create a combined Logs page** (`src/pages/AdminLogs.tsx`)
- Tabbed view with two tabs: **Transactions** and **Audit**
- Transactions tab: shows inventory transactions (extractions, returns, adjustments, stock additions) with metal name, grams, type badge, and timestamp
- Audit tab: shows audit log entries (manual adjustments, edits) with action type, entity, and timestamp
- Both sorted newest-first
- Reuses the existing query logic from `TransactionLog.tsx` and `AuditLog.tsx`

**3. Register the route** (`src/App.tsx`)
- Add `/admin/logs` route pointing to the new `AdminLogs` component
- Keep the existing `/admin/transactions` and `/admin/audit` routes as-is for backward compatibility

### Files changed
- `src/components/AdminLayout.tsx` — add nav link
- `src/pages/AdminLogs.tsx` — new combined tabbed log page
- `src/App.tsx` — add route

