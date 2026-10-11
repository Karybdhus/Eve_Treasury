# JSON reporting
See data-contract.md for the complete version 1.0 envelope and typed payload mapping.
Authoritative project standard:
../schemas/standard

schemas/ contains legacy typed schemas. schemas/standard/ contains project
standard schemas. examples/standard/ contains templates, never auto-imported.
Original and normalized JSON remain separate. IDs and content are immutable.
Repeated identical imports skip; conflicts roll back the entire file.

Financial actuals need evidence. Unknown costs cannot be treated as zero.
Daily profit totals never add snapshots, sessions, plans or historical seeds.
Buyback revenue is shown separately from report profit. Automatic reconciliation
between arbitrary agent income reports and manual buybacks remains incomplete.

PLEX price now needs data.priceEvidence in legacy goal/coordinator payloads:
source (nonempty), fetchedAt (ISO timestamp), quality actual or estimate.
Standard data.plexPrice timestamp/source map to that metadata.
Only actual price evidence no older than 24 hours enables ISK goal calculations.
Historical or missing price evidence remains visible as unavailable funding math.
