# Economic baseline architecture

The opening baseline freezes the selected character group once. A comparison baseline changes the reporting perspective only. Entry snapshots capture the opening capital of characters added later. None of these operations creates a wallet event or resets an existing ledger.

## Setup and coverage

Settings / Baselines contains the group confirmation and comparison management. An empty group cannot be frozen. The central user-triggered synchronization prepares the initial baseline only after setup and successful captured Wallet and Assets observations for the whole group. Missing prices do not prevent a complete quantity baseline.

Core source observations must be post-setup, no more than one hour old, not future-dated, and within a 15-minute observation window. Raw endpoint versions and per-request observation clocks are stored separately: deduplicated raw payloads can retain an older first-storage timestamp. This is a documented observation window, not an atomic ESI snapshot. Optional source coverage remains visible.

Existing installations require an explicit migration confirmation; incomplete coverage requires a second explicit acceptance. Application startup, additive migration, build and page reads do not activate an opening baseline. Old uncaptured snapshots cannot masquerade as complete current sources. Fresh complete productive migration remains a controlled operational step.

## Persistence

SQLite schema 9 adds immutable `economic_baselines`, source observation checkpoints, baseline audit, `inventory_origin_lots` and `inventory_origin_movements`. UPDATE/DELETE triggers protect frozen snapshots; unique constraints protect opening and character-entry identities. Wallets, separately evidenced personal Buy escrow, personal item quantities, available names, owners, locations, container parents, price evidence and source versions are included in the fingerprint.

Inventory movements are quantities and provenance only. The existing Economic Events, Financial Sources, reconciliation and Contract splits remain the sole money accounting system. A guarded consistent SQLite backup precedes the version-9 migration; restore and unchanged historical tables are checked on isolated copies.

## Continuous processing

After source capture: baseline initialization or character entries, acquisitions and proven own transfers, sales ordered by economic time, quantity reconciliation, then financial projection invalidation. Actual purchases precede production and generic rules. Partial current source failures block residual provenance inference even when older successful statuses exist. No background synchronization is added.

Comparison selection adds an exact baseline cutover to default Overview and activity reports. Explicit date ranges retain historical access. A day-only receipt on the cutover day is conservatively excluded when its intra-day position cannot be established. Newly entered characters have their own later opening cutover.

## Read models

Settings returns snapshot summaries and paginated frozen assets (25 rows). Continuity is paginated. The wealth projection uses a short revision-keyed cache and compares only common character scope. Source updates, comparison selection and saved valuation changes invalidate the revision. No page view performs a full inventory reconciliation.

## Operational limits

Production schema activation and a fresh live migration baseline are separate from copied-data acceptance. Existing authorizations must be preserved. No OAuth login, productive ESI sync, EVE write or deployment is part of isolated acceptance.
