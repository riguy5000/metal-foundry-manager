# Architecture rules
- Sweeps receipts and per-casting allocations are separate from inventory transactions; mixed-family dust is not usable alloy stock.
- Sweeps receipt creation and voiding use admin-validated database functions with casting row locks and audit entries so credits cannot be duplicated or partially saved.
- Original casting discrepancies and lifecycle statuses remain unchanged; shared reconciliation helpers derive residual loss from active sweeps allocations.