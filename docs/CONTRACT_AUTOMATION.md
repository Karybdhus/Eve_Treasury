# Contract automation architecture

Rule version: 13.1.

Previously payment binding, stock reservation and revenue split were independent manual decisions. The new planner combines their existing evidence without weakening their checks.

## Flow

1. Read current personal completed outgoing item-exchange archive, owner, purpose and role.
2. Find all current actual positive personal Wallet rows with exact contract_id context. Require one supported receipt, no competing positive row, a valid date and correct external parties.
3. Respect existing whole-Wallet bindings, revokes, manual splits, historical allocations and Buyback overlap.
4. Bind through the existing revision-checked Wallet decision. This alone does not prove an economic origin.
5. Plan inventory reservations against confirmed origins before sale, matching owner, type and available quantity. A unique proven stock may cover a partial quantity. Competing unknown contracts prevent automatic consumption.
6. Build effective origin segments. Changed archive quantities or later origin corrections invalidate old evidence.
7. Allocate one-category receipts fully. Mixed/partially unknown baskets need exact matching manually confirmed position values; Janice estimates never qualify. Allocate stable largest-remainder cents and preserve unknown remainder.
8. Confirm through the existing split decision, recording rule version, evidence hash and complete decision evidence in its transactional audit.
9. Project the same central cash event into activity categories. Do not create a parallel event.
10. Refresh existing read models after successful eligible manual ESI sync.

## Modules

- contract-automation-plan.ts: read-only deterministic decision/evidence plan.
- contract-automation-origins.ts: conservative proven-stock proposals and audited reservations.
- contract-automation.ts: revision-safe binding/split orchestration.
- contract-automation-sync.ts: successful-character gate and reconciliation.
- contract-automation-summary.ts: dashboard gross allocations and exception counts.
- contract-wallet / contract-split: existing decision interfaces retain atomic audit ownership.

The automation metadata is an internal argument, not part of the public manual request contract. Manual split confirmation removes automatic metadata; revocation retains history but disables effectiveness. A stored split never remains effective solely because its earlier classification still exists.

## Financial invariants

Item type is not origin. Imported production and assets are not cash. Exact Contract context proves payment relationship, not PI/Mining provenance. Confirmed legacy Evidence Allocations remain effective without a new automation binding. Multiple payment candidates are not added together implicitly. Unknown amounts and costs are not zero; unknown remainder is not MISC. Explicit acquisition basis and fee/tax evidence are necessary before a Trading profit can be claimed.

## Acceptance evidence

See the automated regression tests for reproducible public checks. Local ignored evidence contains backup/restore checks, historical source mappings, exact financial comparison, browser screenshots and repeat-sync counters. No private Wallet raw data is part of this report.
