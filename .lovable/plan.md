

# Metal Casting Inventory CRM — Foundation Plan

## Overview

Build the foundational architecture for an internal inventory management app used by a jewelry casting workshop. This covers database schema, authentication, role-based routing, and core business logic — no visual polish yet.

## Database Architecture (Supabase/Lovable Cloud)

Seven tables plus a role enum and supporting types:

```text
┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐
│  profiles    │────▶│ casting_     │◀────│ inventory_          │
│  (users)     │     │ records      │     │ transactions        │
└─────────────┘     └──────────────┘     └─────────────────────┘
       │                    │
       ▼                    ▼
┌─────────────┐     ┌──────────────┐
│ user_roles   │     │ metal_types  │◀──── metal_threshold_overrides
└─────────────┘     └──────────────┘
       │
       ▼
┌─────────────┐     ┌──────────────┐
│ audit_logs   │     │ settings     │
└─────────────┘     └──────────────┘
```

**Key decisions:**
- Roles stored in a separate `user_roles` table (security requirement) using `app_role` enum (`admin`, `employee`)
- A `profiles` table for `full_name`, `email`, `active_status` — linked to `auth.users` via trigger
- `has_role()` security-definer function for RLS policies (avoids recursive checks)
- All gram fields use `numeric(10,2)` for 0.01 precision
- `current_stock_grams` on `metal_types` is denormalized for fast reads, updated via transaction logic

## Authentication & Authorization

- Supabase Auth for login (email/password)
- On signup, trigger creates profile + default `employee` role
- RLS policies on all tables using `has_role()` function
- Admin-only tables (settings, user management) restricted via RLS
- Protected route wrapper components: `<EmployeeRoute>` and `<AdminRoute>`

## Route Structure

| Route | Role | Purpose |
|---|---|---|
| `/login` | Public | Auth page |
| `/employee/home` | Employee | View metals, start extraction |
| `/employee/pending` | Employee | Complete pending castings |
| `/employee/recent` | Employee | View own recent activity |
| `/admin/dashboard` | Admin | Overview with warnings |
| `/admin/inventory` | Admin | All metals + stock levels |
| `/admin/castings` | Admin | All casting records |
| `/admin/warnings` | Admin | Flagged discrepancies + low stock |
| `/admin/statistics` | Admin | Logs and stats |
| `/admin/settings` | Admin | Tolerance, thresholds |
| `/admin/users` | Admin | Manage users and roles |

## Core Business Logic

Implemented as Supabase edge functions or client-side with RLS enforcement:

1. **Extract metal** — validates stock >= requested grams, creates `extract_for_casting` transaction, decrements `current_stock_grams`, creates casting record with status `extracted_pending_completion`
2. **Complete casting** — employee enters finished jewelry + returned button grams, creates `return_from_casting` transaction, increments stock by returned amount, calculates discrepancy, flags if over tolerance
3. **Discrepancy calculation** — `discrepancy = extracted - (finished + returned)`, percent = `|discrepancy| / extracted * 100`, compared against metal-specific override or default tolerance
4. **Low stock warnings** — checked against `metal_threshold_overrides` or `metal_types.minimum_threshold_grams`

## Seed Data

Preload 18 metal types (10K/14K/18K/19K/20K/22K/24K gold variants, Platinum, Palladium, Sterling Silver, Non-Tarnish Silver) with sensible defaults for thresholds and display order.

## Files to Create/Modify

- **Database**: Migrations for all 7 tables, enum, trigger, RLS policies, `has_role()` function, seed data
- **Auth**: `src/contexts/AuthContext.tsx`, `src/hooks/useAuth.ts`
- **Routing**: `src/components/ProtectedRoute.tsx`, update `App.tsx` with all routes
- **Pages**: 11 page components (skeleton/functional, not polished)
- **Types**: `src/types/database.ts` with TypeScript interfaces matching schema
- **Services**: `src/services/inventory.ts`, `src/services/castings.ts` for business logic
- **Layouts**: `src/layouts/EmployeeLayout.tsx`, `src/layouts/AdminLayout.tsx` with basic nav

## System Rules Enforcement

- Negative inventory prevented via check constraint + validation before extraction
- Decimal precision enforced at DB level (`numeric(10,2)`)
- Timestamps auto-set via `default now()`
- Every inventory change creates a transaction record
- Every significant edit creates an audit log entry
- Configurable default tolerance in settings table

