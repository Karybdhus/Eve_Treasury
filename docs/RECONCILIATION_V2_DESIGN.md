# Reconciliation V2 design

## Scope and evidence
Contracts are archived globally by contract ID. Observations retain character, raw record,
retrieval time and source time. Missing contracts are retained because the official personal
endpoint only returns contracts within 30 days (except in-progress contracts). Items keep
included/requested direction; neither status nor signed contract price is cash evidence.
The current OpenAPI describes price as "Price of contract" without defining its sign from
the issuer perspective. Consequently expected direction remains UNKNOWN until a wallet
credit or an explicit manual payout confirmation provides evidence. Parties are not ordered
consistently in journal entries; recipient checks use the wallet owner, not party position.

## Single ledger and allocation conservation
V5 financial_sources/economic_events/event_sources remain the only cash ledger. Contracts
are snapshot sources. V6 allocations are evidence edges with exact integer cents, never
additional cash postings. One payment can serve multiple targets; a target can receive
multiple payments. Active sums cannot exceed either source capacity. Contract targets use
an explicitly confirmed expected payout, rather than an assumed sign. Aggregate report
edges consume report capacity and suppress the covered report's duplicate projection only
when its full amount is covered. Partial aggregate coverage remains unresolved.

Every mutation takes BEGIN IMMEDIATE, checks both event revisions, rechecks fresh source
amounts, writes an immutable reconciliation audit entry and increases revisions. Revocation
retains the allocation and the reason. Resync cannot remove manual decisions. Changed amounts
or direction invalidate coverage; the projection reports a conflict instead of silently
reclassifying or paying a contract. Historical XLSX rows never manufacture contract IDs.

## Cost semantics
Components distinguish fee, tax, acquisition, production and operating cost, included in an
amount versus separately charged, and known versus unknown. A cost evidence edge consumes
its own capacity. An included fee explains gross/net and suppresses an independently imported
copy of that same expense; it does not subtract the fee again from a net wallet credit.
Separate components require wallet gross and resulting net evidence and are deducted once. Their independently imported journal proof can be allocated as already represented in net, suppressing a duplicate expense. Gross, net and component relationships must balance in cents. Unknown costs stay unknown.

## Production and ESS
Pending/stolen ESS, reserve pools and unsold tags are observations, never wallet income or
expenses. Positive ESS journal deltas require owner/context evidence or manual confirmation.
PI chains are versioned SDE-based plans with input availability, processor constraints,
storage and skill capacity. Recipes and forecasts never write cash events. Actual buyback
payouts never receive an additional planned 90% discount.

## Migration and checks
V6 adds archival observation, sticky classification, allocation and cost-evidence tables.
Existing V5 tables and records are preserved. File databases are backed up before V6.
Transactional migration failure rolls back the failing step; a restore uses the verified
pre-V6 copy. No production database is opened or transferred during development.

Official references: https://esi.evetech.net/meta/openapi.json and
https://developers.eveonline.com/docs/services/static-data/ (checked 2026-10-08).