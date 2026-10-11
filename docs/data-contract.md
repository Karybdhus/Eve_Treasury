# Data contract / V2 compatibility

Authority:
[JSON_REPORTING_STANDARD_V1](../schemas/standard),
Public schema definitions are maintained in schemas/standard/.

## Two accepted formats

1. Project standard 1.0: common envelope, standard data field names,
   missing fields may be omitted or unknown/not_reported, provenance optional.
2. Original dashboard V1: data.kind selects a strict typed payload;
   every original required measurement must be present. Still accepted unchanged.

The original standard JSON is stored in imported_source_reports and immutable
raw_source_records. The dashboard stores a normalized typed Report separately.
Unknown extra standard payload metadata is retained in the source original;
it is not silently treated as a financial fact. Invalid envelope fields are rejected.
Each JSON file is one atomic batch: 1-500 reports, maximum 2 MB.
POST /api/reports requires application/json and an Origin matching the configured
loopback URL. GET /api/reports returns normalized reports and import metadata.

## Standard envelope

schemaVersion="1.0"; UUID reportId; pillar mining/pi/trading/industry/supplementary/
coordinator/plex_goal; reportType session/daily/weekly/snapshot/transaction_summary/plan;
period.from/to and generatedAt ISO-8601 with offset; source agent/manual/motor_market/
esi/buyback/dashboard; status actual/plan/estimate; currency="ISK"; data object.
Optional provenance="live"|"historical_seed" and notes.
Without explicit historical_seed provenance, an imported standard report is a live
source report; templates are never imported automatically.
New periods are interpreted in Europe/Berlin. Daily aggregates cover an entire
local day, including 23-/25-hour DST days. Source UTC timestamps are retained.
Legacy UTC daily reports retain their recorded UTC accounting-day labels.
Actual future periods and actual plan reports are rejected.

## Payload mapping

| Project standard payload | Internal model / treatment |
| --- | --- |
| MiningSessionReport sessionId/fleetStart/fleetEnd/fleetHours/outputs/directCosts | MiningSessionReport; matched duration only, no inferred revenue |
| MiningDailyReport totalFleetHours/outputs/realizedRevenue/costs/netProfit | MiningDailyReport; netProfit only with evidence |
| PiDailyReport products/pocoTaxes/importExportCosts/netProfit | PiDailyReport; inventory/colonies remain source facts, not production or sales |
| TradingSnapshotReport wallet/escrow/orders/sellOrdersGross | TradingSnapshotReport; inventoryValue is not guessed as cost basis |
| TradingDailyReport grossSales/brokerFees/salesTax/relistFees/realizedTradingProfit | TradingDailyReport with traceable derived result; legacy net remains in original |
| IndustryStatusReport jobs/reactions/materialCosts/jobFees/structureFees/logisticsCosts | IndustryStatusReport; actual non-operational profit rejected |
| SupplementaryIncomeReport activities category/netProfit/sourceTransactionIds | SupplementaryIncomeReport with independently evidenced results |
| CoordinatorSnapshot physicalPlex/freeLiquidity/plexPrice | CoordinatorSnapshot; no allocation inferred from liquidity or per-pillar contributions |
| PlexGoalSnapshot physicalPlex/iskAllocatedForPlex/plexPrice | PlexGoalSnapshot; allocation does not fabricate global free liquidity |

Weekly, transaction_summary and plan types are stored/displayed, never added to
daily accounting. Unsupported pillar/reportType combinations are rejected.
Snapshot state replaces older state when selecting metrics, never sums snapshots.

## Monetary evidence

internalTransfers and PLEX purchases are separate control values, never income.
realizedTradingProfit excludes oldInventoryLiquidationNet. ESI cash-flow records
do not establish Trading cost basis, legacy origin or realized project profit.
Nonzero imported standard net results require sourceTransactionIds,
buybackReference or dataQuality.sourceReferences. Explicit dataQuality unknown/
not_reported/plan/estimate overrides a supplied number. Missing references make
an otherwise claimed nonzero result unknown; an explicit zero activity is accepted.
The adapter does not validate the external truth of an agent's reference; that is
the later reconciliation boundary, not a fabricated proof.

Monetary values are finite, two-decimal ISK numbers or unknown/not_reported;
net profit/transfers may be negative. Quantities and session hours are separate
nonnegative measurements and may have additional decimals. JSON number IDs must
be safe integers; string IDs preserve larger values.
PLEX-price evidence requires timestamp and source. Current allocation is explicit;
release-since-last-snapshot and contribution-by-pillar do not prove current allocation.

## Deduplication and history

Imports: immutable reportId; identical normalized content skips, changed content
rejects. One daily aggregate per pillar/status/accounting day. Sessions use sessionId.
Snapshots use kind/status/observation time; migration recognizes V1 scope keys.
Seeds share duplicate protections but never count in actual results.
Different raw standard input with a reused ID is rejected even if it normalizes
to the same missing-field defaults; originals are immutable.

Raw ESI responses are immutable text; normalized project records are upserted by
stable source identity. Every record has source, source class, optional character/
entity IDs, fetchedAt, sourceTimestamp, dataQuality, status and deduplicationKey.
Mining quantities replace cumulative buckets; production never adds to JSON output.
Wallet journal ref_id, transaction_id, job_id, order_id and pin_id remain lossless.
Cross-source financial consolidation and supersession require future explicit rules.

## Schema files and examples

schemas/*.schema.json are the internal typed dashboard schemas.
schemas/standard/Envelope.schema.json and *.payload.schema.json describe the
project-standard import. Semantic date/evidence/combination constraints also run
in normalizeImport/validateReport and cannot be represented by structure alone.
examples/standard/ contains one valid report per supported pillar/type.
Use a fresh UUID, actual dates, measurements and evidence before importing.
A known zero day must be explicitly reported; missing daily data remains unknown.

## Agent workflow

Collect facts, separate plan/estimate, reconcile transfers and legacy inventory,
emit one project-wide aggregate per pillar/day, preserve ESI/source IDs and
provide references for monetary actuals. Never turn layout/inventory/ledger
quantity into realized sales. Use Europe/Berlin reporting periods and preserve
original UTC source timestamps inside data. Import via UI or local API and retain
reportId for idempotent retries. Historical Markdown and JSON remain unchanged.
