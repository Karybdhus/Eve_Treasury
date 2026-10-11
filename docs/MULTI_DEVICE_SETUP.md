# Multiple devices

Git shares application code, not databases, OAuth credentials or operational reports. Each device needs its own ignored local environment. A copied database containing connected accounts also requires the original encryption key, transferred through a private channel.

Use one designated writable database instance. SQLite files must not be placed in synchronized folders or used concurrently by several machines. Make consistent backups and test restoration on copies. Additional read-only replicas require an explicit operator workflow; cloning the repository does not create one.

See [local setup](USER_SETUP.md) and [security policy](../SECURITY.md).
