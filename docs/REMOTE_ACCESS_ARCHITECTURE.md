# Private remote access

Local mode binds to loopback. The prepared private access mode requires an explicitly configured HTTPS origin, independent authentication credentials and a reviewed proxy boundary. It does not turn an arbitrary forwarded identity into authentication.

Public hosting, database migration and exposing a server require separate operator approval. Code updates alone do not enable remote access. Keep OAuth callbacks consistent with the registered application and review cookie, host and CSRF behavior before activation.

See [ESI configuration](esi.md), [local setup](USER_SETUP.md) and [security policy](../SECURITY.md).
