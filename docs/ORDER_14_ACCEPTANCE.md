# Repository sanitation acceptance

## Current public source

Private operational one-offs and an earlier acceptance document were removed from the index only. Local originals were preserved. Public documentation no longer links private Drive artifacts or reports operational account counts. Public seeds and generated examples use synthetic balances and quantities. Current source and index checks pass without critical, high or medium findings.

## Verification

- Full regression suite: 418 passed, zero failures or skips.
- Typecheck, lint and production build: passed.
- Fresh isolated export: npm ci and production build passed; Chrome shows unknown actual data and no connected accounts.
- Existing application: all twelve navigation views inspected in Chrome; stored financial views remain available. No synchronization, login or financial mutation was performed.
- Data integrity: all existing table contents and local environment matched the private baseline after browser acceptance. Existing encrypted credentials remained readable.
- Security tests cover forced additions of ignored private files, staged secrets absent from the worktree, historical additions subsequently removed, invalid synthetic fixtures and missing local comparison coverage.
- Public documentation links are checked against files present in the Git index, including directory links.

## Automated protection

The local pre-push guard checks the current tree/index and all outgoing commits. GitHub Actions repeats outgoing-commit checks, security tests and documentation validation, and runs an independently checksum-pinned Gitleaks release with complete redaction. Production credentials are not supplied to Actions.

GitHub Secret Scanning, Push Protection, vulnerability alerts and Dependabot security updates were enabled and read back. CodeQL default setup was accepted and reports configured; an accepted configuration is not evidence that its first analysis finished successfully.

## Original historical exposure (superseded by authorized cleanup)

The reachable-history scan covered local/remote branches and tags after fetching remote references. No pull-request references existed at the initial audit. Gitleaks reported no secret leaks. Exact comparison with successfully loaded local secrets and encrypted account credentials found no match. This does not prove that previously rotated secrets were never exposed.

At the initial acceptance, the custom history scanner flagged historical private artifacts. Its high heuristic findings were reviewed as invalid test literals or secret-generator expressions; its raw history result remains failing rather than silently suppressing those signals. At that point, private operational records, financial examples and prior documentation remained reachable in old commits and a legacy remote branch.

The initial acceptance did not perform a history rewrite, force-push, branch deletion or repository recreation. Coordinated history cleanup requires a separate explicit decision and cannot remove copies already held by forks, caches or old clones. Detailed inventories, affected paths/commits, financial comparisons and screenshots remain in ignored local storage and are not uploaded.

Binary content is enumerated and checked by path/signature, but no complete OCR or compressed-content inspection is claimed. Entropy checks are supplementary suspicions, not evidence that a credential is valid.

The initial dependency finding was fixed in the authorized follow-up using an API-compatible scoped glob override. npm audit now reports zero vulnerabilities. Next.js lint rules remain enabled and an actual route-root regression verifies compatibility. See [dependency security](DEPENDENCY_SECURITY.md).

## Delivery boundary

This document describes the reviewed source and local acceptance. Normal delivery to main is authorized; remote commit/tree verification and CI outcome are recorded separately in the private completion report. The authorized follow-up below resolves reachable-history cleanup; external-copy limits remain.


## Authorized follow-up

The owner explicitly authorized history rewriting. Historical private documents, fixtures, operational scripts, binaries and identified private paths were removed in an isolated mirror; the accepted current public tree was restored afterward. Commit messages and author contact metadata were anonymized. Unaffected application source history was retained. The legacy branch contained no unique work and is aligned with the sanitized main tip. See [history cleanup and clone recovery](HISTORY_CLEANUP.md) for verification and external-cache limits. Current local acceptance includes 419 passing tests and a zero-finding dependency audit.
