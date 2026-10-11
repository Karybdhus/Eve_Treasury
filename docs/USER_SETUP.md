# Local setup

For a new installation only:

1. Install Node.js 24+ and run npm ci in the checkout.
2. Copy .env.example to .env.local only when no local configuration exists.
3. Set DASHBOARD_DB to a new absolute local SQLite path, for example C:/Projects/Eve_Treasury_Local/data/dashboard.sqlite. Set DASHBOARD_DEMO_SEED=0.
4. Run npm run dev and open http://127.0.0.1:3000. Production mode uses npm run build followed by npm start.

The application binds to loopback. Initial data is unknown until imported or connected. ESI is optional; see [ESI setup](esi.md). Generate secrets locally using npm run secrets only for a new installation. Preserve TOKEN_ENCRYPTION_KEY when retaining connected accounts.

For an existing installation, preserve its environment file and data. Take a consistent backup with npm run backup before an authorized schema migration. Test restoration and migration on an isolated copy first. Do not run seed commands on a production database.

Read [security policy](../SECURITY.md) and [multi-device boundaries](MULTI_DEVICE_SETUP.md) before sharing a checkout.
