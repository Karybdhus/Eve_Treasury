# Contract attribution and pending volume (V17)

The application never creates money from a Contract status or offered price. Realized receipts require a unique positive personal Wallet Journal entry with the matching Contract context and supported ref type. Pending is a separate read-only projection and never feeds reconciliation, Wallet, net profit or wealth.

## Display and scope

`100 (200) Mio ISK` means 100 paid plus 100 still offered, for a total potential volume of 200. If pending is zero, only the paid value appears. No reports means unknown, rather than an invented zero. Activity values also include other centrally proven activity receipts; the Contract total contains Contract receipts only.

Paid receipts use their payment date, character, enabled source and selected baseline cutover. Pending uses the latest stored state of own personal outgoing item exchanges, a positive exact price, a nonexpired outstanding/in-progress state and no payment evidence. It includes offers already open at the start of the period, and excludes offers issued after its end. It is not a reconstruction of past outstanding balances. Cancelled, rejected, reversed, deleted and failed offers are excluded. Internal recipients, purchases, corporations, couriers and collateral are excluded. Ambiguous payment evidence is an exception, not pending or paid revenue.

## Priority and assumptions

1. Explicit item decisions and revocations remain authoritative for that position. Existing manually confirmed splits are never overwritten.
2. Existing proven purchase/production lots and exact confirmed inventory positions precede generic inference.
3. A prior own personal external market purchase covering the item quantity, or a prior proven Contract purchase lot, makes an otherwise unknown item Trading. This heuristic establishes attribution, not a new acquisition or proven unit cost.
4. Without purchase evidence, official SDE groups supply a deterministic rule-based assumption: asteroid Ore, Ice and Ice Products -> Mining; planetary resources and commodities -> PI; Salvaged Materials -> Salvage; Ancient Salvage, datacores, decryptors and Research Data -> Hacking; Covert Research Tools -> Hacking; ships, modules, charges, drones, implants and defined miscellaneous site goods -> Loot. Ships/modules can have other histories: the fallback is explicitly an assumption, not proof of an NPC drop. Other known SDE groups use the documented rule-based MISC default for ambiguous activity; types absent from SDE stay unknown. Proven Industry output retains its production origin and appears under MISC within the existing nine-category economic model.
5. Changed/revoked proof, conflicting item quantities or revised confirmed positions require review. A missing price valuation alone does not.

The checked-in public activity catalog is generated from an existing official CCP JSONL SDE ZIP:

```powershell
node scripts/build-activity-catalog.mjs data/sde/official-3586130.zip
```

The artifact records its source and archive SHA256. No private ESI data or names are embedded in it. The full public type map avoids depending on a running ESI type-name service.

## Mixed Contracts

One-category payouts are exact category totals. Mixed payouts use matching position valuations where available. Without complete individual prices, quantities are deterministic proxy weights. These are estimated allocations, never alleged item sale prices. Stable largest-remainder allocation conserves the actual receipt to the cent. Unknown-category shares remain explicitly unallocated. A contradictory stored type/quantity valuation blocks reuse and is an exception. Estimates are visible in the Contract detail and financial-origin drill-down.

## Opening inventory and replay

The opening snapshot is immutable. A lot can have a Mining activity category and OPENING_STOCK origin simultaneously. Such income appears once under its activity; its liquidation amount is a labelled subset, never added a second time. No classification creates post-baseline production quantities.

After a successful explicitly manual ESI sync, stored sales and historical Contract receipts are reprocessed. Failed/partial authorization does not silently trigger writes or fabricate receipts. Replay respects existing reservations, historical payment capacity and manual decisions. Existing financial sources, event identity and quantities are preserved; derived classifications/splits may receive a new audited revision.

## Limits

Missing payment context, multiple competing receipts, contradictory manual proof, unknown SDE groups and genuine quantity conflicts remain exceptions. Costs, prices, or playtime absent from the sources remain unknown. A stale stored Contract listing is not a fresh ESI observation. Resetting and reloading the installation is a separate operator action; V17 never clears existing data.
