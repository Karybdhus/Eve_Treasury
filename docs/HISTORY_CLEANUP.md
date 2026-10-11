# Authorized history cleanup

A private complete Git bundle and consistent database backup were verified before rewriting an isolated mirror with git-filter-repo. Old documents, fixture data, operational scripts, historical binary artifacts, no-longer-public paths and identified private paths were removed across all reachable refs. The accepted current public source was restored in a new tip. Historical commit messages and author contact metadata were anonymized; unaffected source-code history remains.

The legacy feature branch was already contained in main and is aligned with the sanitized main tip rather than retaining an obsolete public snapshot. Updates use explicit branch-specific leases so concurrent remote changes cannot be overwritten. No private local database, credential, environment or original report is part of the new history. Local originals and the old Git history remain in ignored private storage.

Current and full reachable-history scans are run with exact local secret comparisons before publishing. An independent Gitleaks scan complements these checks. Dependency verification and functional regression results are described in [dependency security](DEPENDENCY_SECURITY.md) and [acceptance](ORDER_14_ACCEPTANCE.md).

## Other clones

Existing clones must not merge or push their old graph back into this repository. Preserve private environments, databases and uncommitted work first, then make a fresh clone into a separate directory. Transfer only explicitly reviewed local files outside Git. Never replace an existing encryption key when retaining authorized accounts. Do not use reset/clean commands as a shortcut for preserving private data.

## External copies and caches

Rewriting branch refs removes old private content from reachable repository history. It cannot erase old clones, independently held copies or GitHub cached commit views. GitHub support may need to remove cached sensitive views and unreachable objects. Detailed affected commit IDs and a support request draft remain private; no automatic external message is sent. A successful reachable-history scan does not claim global erasure.
