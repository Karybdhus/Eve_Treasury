# ESI / SSO V2

## First character

1. Register a Native/PKCE application in https://developers.eveonline.com/applications.
2. Configure its callback exactly as http://127.0.0.1:3000/api/auth/eve/callback.
3. Enable the desired scopes from the table below.
4. Copy .env.example to .env.local, enter the Client ID and callback.
5. Run npm run secrets locally; copy its generated values into TOKEN_ENCRYPTION_KEY
   and APPLICATION_SECRET in .env.local. This command prints new random local keys.
   Never paste real keys into reports or commit the file.
6. Restart the server. Open http://127.0.0.1:3000/characters.
7. Choose Mit EVE Online verbinden, select a character at CCP and approve its scopes.
8. Back in Characters / ESI, choose Manueller Sync.
9. Repeat the SSO flow for every additional character; authorization is never account-wide.

For native PKCE leave EVE_CLIENT_SECRET empty. A confidential application can supply
its client secret server-side; token calls then use HTTP Basic client authentication.
The registered application type and exact callback must match the local configuration.
If using localhost instead of 127.0.0.1, change the callback registration,
EVE_CALLBACK_URL and browser URL consistently. Network hosting is not supported.

## Scopes and endpoints

| Area | Scope | GET endpoints |
| --- | --- | --- |
| Mining | esi-industry.read_character_mining.v1 | /characters/{id}/mining |
| PI | esi-planets.manage_planets.v1 | /characters/{id}/planets and /planets/{planet_id} |
| Wallet | esi-wallet.read_character_wallet.v1 | /characters/{id}/wallet, /wallet/journal, /wallet/transactions |
| Industry | esi-industry.read_character_jobs.v1 | /characters/{id}/industry/jobs?include_completed=true |
| Market | esi-markets.read_character_orders.v1 | /characters/{id}/orders |

PI's scope name includes manage, but this application has only GET ESI methods.
Missing granted scopes are shown per area and skipped. Adding a scope requires
reauthorizing the character, not merely changing an environment variable.

## Implemented behavior

Authorization Code + PKCE S256, cryptographically random state, signed HttpOnly
SameSite cookie, encrypted one-use verifier and ten-minute state expiry.
JWT signature verification uses CCP metadata/JWKS, RS256, issuer allowlist,
client ID AND EVE Online audience, expiration, character ID/name/owner claims.
Access/refresh tokens are encrypted server-side with AES-256-GCM, random IVs
and character-specific authenticated context. Automatic refresh verifies character
and owner before accepting the rotated token. Tokens are never returned to UI.
The loopback-only server and same-origin mutation checks protect local controls;
this is a single-user local application, not a multi-user hosted service.
Disconnect removes local credentials; revoke at CCP Authorized Applications if needed.
Reauthorize requires the same character to be selected. History remains preserved.

All ESI calls go through EsiClient with X-Compatibility-Date=2026-08-18 by default.
That date was returned by CCP's /meta/compatibility-dates and the corresponding
OpenAPI was reviewed on 2026-10-08. Set ESI_COMPATIBILITY_DATE deliberately after
reviewing breaking changes; dates in the future are rejected.
TTL, Cache-Control/Expires, ETag/304 and pagination are respected. Rate limits
persist retry deadlines; no aggressive retry loop runs. API failures remain visible.

Mining raw quantities, PI layouts/pins/contents, journal/transactions, wallet balance,
industry jobs and open orders appear automatically after a manual sync.
Syncs are manually triggered in this release; no background scheduler is installed.
Partial area failures retain previous good values and are reported in sync history.

## Limitations and deliberate boundaries

- No live character was authorized during implementation. Automated tests use
  clearly isolated synthetic fixtures; live data requires your Client ID and consent.
  The running application has no mock character, fake wallet or demo ESI response.
- ESI mining ledger covers about 30 days, has UTC date buckets and cumulative raw
  quantities; it has no fleet duration, compressed-block equivalence or revenue.
  Imported sessions and ledger amounts remain separate, with no inferred ISK/h join.
- Manual mining sessions record character elapsed time; simultaneous character
  times are never summed into fleet hours. Existing measured JSON fleet sessions
  can still supply their own matched quantity/revenue/duration.
- PI layout is recalculated only when viewed in EVE. fetchedAt does not make
  last_update current. Freshness uses a 24-hour display threshold; recent snapshot
  is still not live state. Expiry/active labels describe the stored snapshot.
- Storage percentages remain unknown without reliable capacities and item volumes.
  Pins/contents, schematics, links and routes are persisted. Products, planets,
  facilities and activity/blueprint IDs may appear as IDs until static-name metadata
  is integrated; IDs are real source values, not substitute/fabricated names.
- Wallet journal is a limited source window (about 30 days). Bounties and related
  tax amounts are classified; informational tax fields are not subtracted twice.
  The UI shows a source-backed partial wallet delta for the project period,
  not a complete ratting-session net profit. ESS remains unvalidated/partial.
- Corporate tax and transfers can be ambiguous. Transfers between known project
  characters are eliminated from income; unresolved transfers stay unknown.
  Relist vs broker fees are not reliably split by raw ref_type alone.
- Transactions and journal are alternative evidence of cash flows and are never
  summed together. Costs, origin/legacy inventory and allocation still need
  consolidation before claiming a Trading net profit.
- Auto ESI records do not add to imported daily profit. Motor Market remains
  the preferred Trading analysis and connects by JSON. Its direct DB adapter,
  additional external Buyback integrations and background scheduling require separate scope. Accounting reconciliation operates on stored evidence.
- Industry jobs may include completed jobs only within CCP's roughly 90-day window.
  Job cost is installation/facility expense, not a realized profit.
- No automatic order creation, PI changes, Industry actions, EVE-client automation,
  PLEX purchases or EVE Guru integration.

## Primary references

- https://developers.eveonline.com/docs/services/sso/
- https://developers.eveonline.com/docs/services/esi/overview/
- https://esi.evetech.net/meta/openapi.json
- https://esi.evetech.net/meta/compatibility-dates
- https://login.eveonline.com/.well-known/oauth-authorization-server

These references were checked during implementation. No private account data
or credentials were sent to documentation services.
