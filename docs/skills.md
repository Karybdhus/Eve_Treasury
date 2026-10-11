# Skills and skillqueue
Official schemas reviewed on 2026-10-08 with X-Compatibility-Date 2026-08-18:
https://esi.evetech.net/meta/openapi.json
https://developers.eveonline.com/docs/services/esi/overview/

GET /characters/{id}/skills and /attributes: esi-skills.read_skills.v1
GET /characters/{id}/skillqueue: esi-skills.read_skillqueue.v1
GET /characters/{id}/implants: esi-clones.read_implants.v1
All endpoints use the existing central GET client/cache/rate limiter.
Skill fields distinguish trained_skill_level from active_skill_level.
The active level may differ because of Alpha status or Expert Systems.

A queue finish in the past can update the displayed trained level only if the
queue was retrieved after that completion. It cannot silently infer active
entitlement. Current effects use the active skill snapshot. Future queue effects
are estimates under unchanged queue/entitlement assumptions.
No historic income is recomputed with future bonuses.
No mining ISK/h or production gain is inferred from skills alone.

Economic descriptions and constants were checked against official public
GET /universe/types/{id} for each economic skill in esi/skills.ts.
Examples: Accounting 16622, Broker Relations 3446, Advanced Broker Relations 16597,
Command Center Upgrades 2505, Interplanetary Consolidation 2495.
Sales tax uses 7.5% * (1 - 0.11 * Accounting level).
NPC broker baseline excludes standings and player structures.
PI scan skills improve resolution and never create an assumed production bonus.
Capacity/time factors are theoretical and do not imply active jobs or earnings.

Name resolution fetches at most 80 distinct prioritized queue/economic/trained
types per sync, with ESI cache. Remaining types show explicit Type IDs.
Offline fixtures cover authorization behavior. A public checkout has no connected accounts; local connections and live acceptance are operator-specific private information.
