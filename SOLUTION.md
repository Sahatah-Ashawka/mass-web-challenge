# Organizer Solution

1. Open `/robots.txt`.
2. Notice `/release-notes`.
3. Read `/release-notes` or `/api/docs` and find the legacy profile update support for `_method=PATCH` or `X-HTTP-Method-Override: PATCH`.
4. Register a normal user and open `/portal`.
5. A normal profile update with `role=admin` is ignored:

```http
POST /api/profile HTTP/1.1
Cookie: sid=...
Content-Type: application/x-www-form-urlencoded

displayName=test&role=admin
```

6. Send the same profile update through the legacy method override path:

```http
POST /api/profile HTTP/1.1
Cookie: sid=...
Content-Type: application/x-www-form-urlencoded

_method=PATCH&displayName=test&role=admin
```

7. Keep the refreshed `sid` cookie returned by that response. Browsers do this automatically.
8. Visit `/admin` or `/api/admin/flag` to retrieve the flag.

The vulnerable code is in `handleProfile()` in `server.js`. The legacy `PATCH` branch copies all submitted keys into the current user object with `Object.assign(user, updates)`.
