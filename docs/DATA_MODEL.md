# Data model
Schema version 3 adds buyback_bookings, buyback_audit, buyback_wallet_links,
buyback_imports, app_settings and reported_profit_decimal.

buyback_bookings:
booking_id UUID; week_start Monday; contract_id optional; body normalized JSON;
created_at/updated_at. Body contains weekEnd, category lines, exact decimal payout,
optional Janice values/costs/date/character/counterparty/notes, lifecycle,
reconciliation, revision, source and historicalAggregate.
One actualPayoutISK belongs to the group. Category amounts must sum to that value.
Duplicate live contract IDs are rejected. Optimistic revisions prevent lost edits.
Storno keeps the booking and immutable audit revisions. Matched payments are locked
until the evidence link is removed.

buyback_wallet_links maps one journal key to one payout, unique in both directions.
Explicit positive amount, optional character and Berlin payout date must match.
Linking/unlinking creates audit entries and never creates an income event.

buyback_imports stores original XLSX bytes by SHA256, original filename, import time,
control comparisons and import result. Weekly source keys are stable across files.
Changed existing historical weekly data is rejected for review.
Blank categories remain null, explicit 0 is canonical 0.00.
Entirely blank weeks are not_reported, not confirmed income.
Monthly/year controls are stored only as checks and never as bookings.
Unknown payout dates remain null. Monthly attribution uses week start as an
explicit historical convention, not an invented cashflow date.

V2 entities: characters, encrypted_credentials, oauth_states, esi_sync_runs,
sync_locks, esi_cache, raw_source_records, project_records, manual_sessions,
reports and imported_source_reports. See migrations.md and esi.md.
reported_profit_decimal receives new canonical profit values; old REAL rows are
retained unchanged and copied once for compatibility.

## Schema v5
financial_money stores source-key/field/value_decimal/quality. financial_sources is the normalized financial projection. economic_events owns canonical category and revision. event_sources has a unique source key, event FK, matching method, evidence, confirmation time and manual flag. reconciliation_decisions retains rejected pairs. reconciliation_audit stores all matching/correction changes without overwriting originals. An active manual-session unique index prevents concurrent duplicate starts. See RECONCILIATION.md.

## Contract decisions (introduced in schema 6)
 app_settings.name=contract_purpose:<id> speichert buyback,courier,other,unclassified. Aktualisierung gemeinsam mit contract_decisions-Revision und reconciliation_audit. Originale/contract_observations bleiben unveraendert. Neue Goods-Labels MINING_ICE,PI,LOOT,SALVAGE,HACKING mappen auf vorhandene interne Kategorien; kein Importrewrite. Konsolidierte Event-Ausgabe ergaenzt legacy, damit kompakte Kennzahlen Altbestand ausschliessen. Fleet-Verwaltung wird unabhaengig vom Accounting-Quellenfilter angezeigt.


The current supported schema is version 8; see [storage migrations](migrations.md). Provenance and reservation tables extend the historical model without replacing immutable source records.
