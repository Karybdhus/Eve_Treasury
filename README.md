# EVE Treasury

Local economic dashboard built with Next.js, TypeScript, SQLite, Tailwind and Recharts. EVE integrations read account information; the application does not place orders, purchase PLEX or change planetary operations.

## Installation

Requires Node.js 24+ and npm. Run npm ci, then follow [local setup](docs/USER_SETUP.md). Existing installations must retain their database and encryption key. Never replace an existing environment file with the example.

## Views

Overview, PLEX goals, weekly performance, Mining, PI, Trading, Industry, Contracts, Characters, Imports, Settings and Sessions expose stored information and its provenance. Missing amounts remain unknown. Plans and estimates never become actual income.

## Accounting

Profit, free liquidity, escrow, inventory and allocated PLEX funding are separate. Internal transfers are eliminated. Open sell orders are not realized revenue. Historical liquidation and PLEX purchases are not new trading profit. Imported reports and ESI evidence are reconciled instead of added twice.

## Data

[Versioned data contract](docs/data-contract.md), [ESI configuration](docs/esi.md), [architecture](docs/ARCHITECTURE.md) and [migration behavior](docs/migrations.md) describe the interfaces. Public seed files are synthetic fixtures, never current account observations. Set DASHBOARD_DEMO_SEED=0 for an empty installation.

## Verification and security

Run npm run test, npm run typecheck, npm run lint and npm run build. See [security policy](SECURITY.md) before publishing code. Operational reports, account data, credentials, local paths and security findings belong in ignored local storage. Public code is shared independently of private databases.


Contract classification, paid/pending presentation and assumptions: [V17 accounting rules](docs/CONTRACT_CLASSIFICATION.md).
