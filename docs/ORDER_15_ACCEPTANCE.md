# Order 15 acceptance

Status: local isolated financial, migration-copy and browser acceptance completed with the evidence boundaries below. Productive activation is intentionally excluded. The normal main publication and remote CI verification are recorded in the private handover after this report is committed.

Starting public main: `1b36bbad69e45e8fb903cd97fb24a436e497cb0f`.

## Implemented scope

Immutable opening/entry/comparison snapshots, exact personal quantity and valuation capture, source clocks, guarded additive schema-9 migration, persistent provenance lots, purchases and production rules, FIFO sales, separate opening liquidation, read models, Settings comparison management, paginated human-readable stock and income traces. Existing central cash accounting and nine categories are preserved.

See [baseline architecture](BASELINE_ARCHITECTURE.md), [origin rules](INVENTORY_ORIGIN_RULES.md), and [valuation policy](ECONOMIC_VALUATION_POLICY.md).

## Required financial scenario map

All paths below identify automated assertions. The aggregate regression covers the 32 required scenarios plus additional precision, source-change, late-evidence, incomplete-baseline and escrow protections.

| Cases | Test evidence |
|---|---|
| 1-4: empty, complete group, missing owner, immutable repeat | economic-baseline.test.ts |
| 5-7: opening / purchase / Mining quantities | inventory-continuity.test.ts; order15-acquisitions.test.ts |
| 8: paid Ice Contract | continuous-contract-sales.test.ts |
| 9: purchased PI sells as Trading | continuous-market-sales.test.ts; continuous-contract-purchases.test.ts; contract-automation.test.ts |
| 10: own PI sells as PI | order15-acquisitions.test.ts; continuous-contract-sales.test.ts |
| 11-13: Salvage / Hacking / inferred Loot | order15-origin-rules.test.ts; order15-acquisitions.test.ts |
| 14-15: mixed receipt cents / missing valuation | continuous-contract-sales.test.ts; contract-automation.test.ts |
| 16-17: opening liquidation / own transfer | continuous-contract-sales.test.ts; continuous-market-sales.test.ts; inventory-continuity.test.ts |
| 18-20: regrouping, split disposal, transformation cost | inventory-continuity.test.ts; inventory-provenance.test.ts |
| 21-24: unknown basis, replay, late purchase, manual priority | continuous-market-sales.test.ts; inventory-continuity.test.ts; order15-acquisitions.test.ts; contract-automation.test.ts |
| 25-27: entry scope and comparison without ledger reset | order15-scope-wealth.test.ts; order15-perspective.test.ts |
| 28-30: price-only change, opening sale and unpriced opening | order15-scope-wealth.test.ts; continuous-market-sales.test.ts; economic-baseline.test.ts |
| 31: partial current sync | order15-acquisitions.test.ts; order12-sync.test.ts |
| 32: broker-refund correction | trading-costs.test.ts; order11r2-financial.test.ts |

## Browser evidence so far

Actual Chrome against isolated synthetic data exercised initial group confirmation and automatic opening, reload, Mining receipt drill-down, purchased PI Trading/Contract cost basis, opening liquidation, Settings comparison creation/selection/back-switch, and provisional Salvage corrected by a later purchase. These are controlled local source responses through the real coordinator, not live CCP requests. The rebuilt UI also passed readable purchase-origin and cost details, partial wealth / separate escrow labels, and responsive checks of Overview, Settings, stock tables and income traces at all five required widths. Wide tables remain inside focusable horizontal scroll regions; mobile comparison inputs and the save action remain usable.

Overview was measured at actual 1440, 1280, 768, 375 and 320 viewport widths, without document overflow. Real screenshots are retained privately. No real private financial screenshots are published.

On a consistent real-data copy, Chrome required both migration and incomplete-coverage confirmation, showed missing Wallet as unknown, and froze a visibly incomplete baseline. Chrome displayed the existing Trading wallet view, archived Contract cards and loaded historical weeks; the incomplete baseline remained visible after subsequent reads. Stored historical source replay preserved all historical economic events, event count and encrypted credentials. This proves the explicit incomplete migration branch, not fresh live source completeness.

## Data safety

Guarded schema-8 to schema-9 copy migration preserved all 42 pre-existing tables. Restore integrity and restored schema 8 passed. Productive reference checks found unchanged tables and environment. No productive baseline, ESI synchronization or authorization change was performed.

## Final local verification

The final aggregate regression passed 473/473 tests with zero skips. Lint, Typecheck and the isolated Production Build passed. Detailed run evidence is retained in the private handover. The documented 32-scenario map remains tied to the named executable tests.

Repository, staged changes and reachable history are checked with the existing scanner, including comparisons against locally available credential values. Independent redacted Gitleaks checks cover history and staged diff. No private database, workstation instruction, screenshot or security report is part of the public changeset. The dependency audit reports zero known vulnerabilities. Public documentation links are checked.

## Local performance samples

Final real-copy samples with explicitly incomplete historical coverage: baseline preparation 91.09 ms; wealth cold 11.94 ms / warm 0.36-0.45 ms; acquisition replay 442.44 ms; sale replay 322.33 ms. The first Overview request after server start took 4014.69 ms; subsequent requests took 484.66-526.05 ms. Contracts: 90.20-105.42 ms; Mining drill-down: 130.06-133.75 ms. Cold initialization remains a visible performance limit.

A complete synthetic 5000-position baseline took 85.05 ms to prepare and 336.13 ms to materialize, without cash events. A controlled synthetic full coordinator run took 522 ms. These are scoped local measurements, not a live ESI performance guarantee or a full live synchronization benchmark.

## Evidence boundaries and operating decisions

- Full initial setup was exercised using injected synthetic ESI responses through the real coordinator. No CCP login or productive ESI request was performed.
- The real-data migration branch was consciously accepted as incomplete, on a copy only. It does not establish fresh productive source completeness.
- Overall wealth remains unknown without independent coverage of all capital, colony and external-flow components. Wallet/Asset subtotal changes and evidenced Buy escrow are shown separately.
- Partial/multiple late origin matches and transferred/transformed descendants require audited review. Conflicting projected categories/costs are invalidated rather than continuing to claim a disproven origin. An incomplete opening cannot turn first reliably observed residual stock into new production.
- Manually confirmed or revoked decisions remain authoritative; ambiguous Market disposal is deferred.
- Historical sources and credentials remain preserved. Production schema/baseline activation, live source coverage and any deployment require their own controlled operating step.

## Publication

Target: the existing cleaned `main`, with a normal fast-forward push only after the local gates. The public starting head is recorded above; the enclosing commit identifies this implementation. Exact remote-head equality and GitHub check outcomes are recorded in the private delivery reports. No force push, history rewrite or old private object restoration is used.
