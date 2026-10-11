# Architecture

Next.js App Router renders the dashboard and provides authenticated application endpoints. SQLite persists imported originals, normalized reports, ESI observations, provenance and financial reconciliation. TypeScript and Zod define versioned contracts. Tailwind and Recharts render compact views.

Server-only modules retain encrypted OAuth credentials. Read-only ESI synchronization is a distinct source adapter; JSON and manual imports remain independent. Source evidence is preserved and deterministic reconciliation prevents double counting. Unknown values, estimates and plans retain their status throughout the read model.

Consistent SQLite backups and additive migrations protect existing data. Startup behavior is documented in [migrations](migrations.md); new installation guidance is in [local setup](USER_SETUP.md). Never test migrations against the active database.

Operational reports and security inventories are local private artifacts. Public documentation describes reproducible behavior rather than a particular operator's account balances or infrastructure. See [security policy](../SECURITY.md).
