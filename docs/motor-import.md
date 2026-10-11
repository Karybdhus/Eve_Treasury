# Motor Market import
Reviewed public README and documentation tree:
https://github.com/PeanutMotor/eve-motor-market
No documented native CSV/JSON export contract was found on 2026-10-08.
No foreign local database or GUI automation is used.
This is the dashboard's own explicit exchange contract, not a claim that Motor
currently emits this file natively. An agent/manual transformation can produce it.

UTF-8 CSV, comma separator, quoted fields/doubled quote escaping, maximum 500 rows.
All following headers required; optional values use blank, unknown or not_reported:
source_id,character_id,source_transaction_id,timestamp,type_id,side,quantity,
unit_price_isk,cost_basis_isk,cost_basis_reference,broker_fees_isk,sales_tax_isk,
relist_costs_isk,operating_costs_isk,goods_origin,status

side: buy or sell; quantity positive integer; money decimal text max two places.
timestamp ISO with offset. character/type/ESI transaction IDs are decimal strings.
source_id stable ASCII export identity. Optional source_transaction_id ties to
the ESI wallet transaction. The canonical ESI ID makes repeat exports idempotent.
goods_origin purchased/self_earned/legacy/unknown; status actual/plan/estimate.
cost_basis_isk is the total sold-lot cost, not unit cost.
A purchased sell yields verified net only with a cost basis reference and ALL
cost/fee/tax fields explicitly known, including explicit zeros.
Legacy liquidation remains separate. Self-earned sales are revenue, not invented
trading profit. Plans/estimates never enter actual totals.
Original CSV is immutable raw source data. Conflicting identities roll back the file.
Motor totals remain independent of agent daily totals and are never added together.
A future unified event reconciliation layer must select one authority per event.
