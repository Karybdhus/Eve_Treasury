# Security and privacy

Never commit environment files, account databases, OAuth material, private operational reports, security findings or identifiable financial records. Keep original private files locally when removing them from the Git index. Public examples must be synthetic.

Run npm run security:scan before committing. Detailed local findings belong under ignored data/security/. A successful current-tree scan is not a guarantee that historical commits, forks or old clones are clean. Historical exposure requires a separate, explicitly approved cleanup decision; rotating a credential does not remove private records from history.

Do not publish raw scanner output containing credentials. Report suspected exposure privately to the repository owner, identifying the affected component without including secret values. Confirm validity locally before deciding on rotation.

Application integrations are read-only. Production synchronization, migrations, deployment and history rewriting require their applicable authorization. Review backups and preserve the encryption key before any approved change to an existing installation.


Install the local pre-push guard with npm run security:hooks. It preserves an existing alternative hook configuration. The guard checks the current index and every outgoing commit, including files introduced and removed within the push. CI repeats outgoing-commit checks and a checksum-pinned Gitleaks scan. No production secrets are supplied to Actions.
