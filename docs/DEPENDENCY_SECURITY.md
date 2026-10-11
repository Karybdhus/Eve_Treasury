# Dependency security

GHSA-vfj7-8cjw-p6xm affects braces through 3.0.3, with no published patched release at verification time. The Next.js ESLint plugin uses only globSync(pattern, {onlyDirectories: true}) from fast-glob. A scoped npm override supplies tinyglobby 0.2.17 for this dependency. Its CommonJS globSync and directory options preserve the consumed API, while removing fast-glob, micromatch and braces from the installed graph.

No framework lint rules are disabled and no audit findings are suppressed. A regression creates an actual route-root glob and verifies that the Next internal-link rule still detects an invalid anchor. npm ci, full regression tests, lint, typecheck, build and npm audit validate this change. Reassess the override when upgrading eslint-config-next.

Reference: [GitHub advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
