# Financial integrity and reconciliation
Follow-up 01. SQLite v5; no external EVE writes.

## Sources and events
Original reports, JSON file text, ESI response text and XLSX bytes are retained.
financial_sources is a refreshable view of source facts; economic_events and
event_sources hold stable event membership. A source belongs to at most one event.
Source keys remain stable across imports/sync. Links are never overwritten by sync.
Changes to linked evidence can produce conflicts; verified metrics are then withheld.

Matching uses character-scoped transaction IDs, journal_ref_id, contract context,
or a previously confirmed wallet bridge. A contract with several payments is
ambiguous. Amount/date alone and report references create proposals, not final links.
Manual matching confirms the same complete event, not an arbitrary partial amount.
Reject, unlink and classification changes require a reason and retain audit.
Both old Buyback wallet unlink and new Reconciliation unlink detach the event link.

Classification maps the existing journal classifier into canonical financial
categories. Manual classification overrides apply to events, leaving source
inference and originals unchanged. Mixed buyback categories remain in payout lines;
one payout is counted once. Mining/PI quantities and snapshots never create income.

## Exact amounts
Canonical signed decimal strings and BigInt cents are authoritative for the new
financial path. The JSON import parser preserves monetary tokens before Number
conversion; large IDs remain strings. Contracts accept compatible decimal inputs.
Old raw numeric schemas are retained rather than destructively rewritten.
Unrecoverable large numeric legacy amounts are precision_unknown, not repaired by
inventing cents. Exact facts use raw lexical values when trustworthy source text
exists. Historic REAL profit copies are marked legacy_precision_unverified.
Rounded weekly ISK requirements use explicit integer rounding. Chart scaling,
quantity ratios and older per-hour presentation ratios are approximate displays,
not financial ledger amounts. The new consolidated API emits monetary strings/null.

## Metrics and limits
Overview, Weekly, PLEX and Insights share FinancialSummary and the same service as
/api/analytics and /api/reconciliation. Query filters: from, to (ISO dates),
characterId and source. Gross buyback, net new trading, other receipts, known costs,
legacy liquidation and surplus remain separate. Legacy report totals are labeled
not consolidated. Configured funding targets propagate to UI/API/insights.

verified_scope describes only the selected stored evidence, not proof that every
account and cost has been reported. Unconfirmed aggregate/cash overlap, possible
duplicate costs, missing purchase basis, contradictory evidence and unknown costs
suppress surplus. Open/rejected proposals are visible. Whole-event confirmation
does not implement splitting a daily report across many payments or allocating
embedded CSV fees against separate tax journal lines. These remain unresolved
until enough explicit evidence exists; no silent automatic netting is performed.

## Migration
openDatabase creates a pre-v5 timestamped VACUUM backup before migration.
Migration is additive and transactional; reports/raw bodies remain unchanged.
scripts/migrate-financial.ts validates original entity counts before and after.
Local v4 -> v5 migration preserved 4 reports and 78 buyback aggregates.
Restart an already-running older application after upgrading the database.

## Acceptance
89 tests pass, including existing regressions, 27 new financial tests and expanded
runtime acceptance for all 14 views, UI/API filter consistency and concurrent HTTP
edits. Integration uses fixtures and isolated databases. No private ESI live
acceptance, new authorizations or EVE actions were performed.
