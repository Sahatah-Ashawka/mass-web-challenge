# web

Medium web CTF challenge built around method override plus mass assignment.

## Scenario

web is a badge-management portal for an event security team. Normal users can sign up and edit harmless public profile fields. Admin-only pages hold the flag.

## Intended Bug

The modern profile update path only saves allowed display fields. A legacy compatibility path accepts `_method=PATCH` or `X-HTTP-Method-Override: PATCH`, then blindly applies every submitted field to the current user profile.

Solvers should discover the legacy behavior through `/robots.txt`, `/release-notes`, `/sitemap.xml`, or `/api/docs`, then submit `role=admin` through the overridden profile endpoint.

## Difficulty

Medium. The challenge requires route discovery, request editing, and understanding the difference between normal profile updates and legacy method override handling. It avoids XSS, SQL injection, command injection, SSRF, SSTI, serialization, Unicode encoding tricks, case-sensitive route tricks, and race conditions.

## Flag

Set a custom flag with the `FLAG` environment variable. The default is:

```text
flag{m3th0d_0v3rr1d3_m455_4551gnm3nt}
```

## Files

- `server.js` - challenge server and vulnerable logic
- `public/styles.css` - UI styling
- `verify.js` - automated intended-solve check
- `SOLUTION.md` - organizer-only solve notes
- `Dockerfile` - normal container deployment
- `Dockerfile.vercel` - Vercel container-function deployment through GitHub

## Deployment Notes

The app uses only Node.js built-in modules, so it does not need dependency installation.

For Vercel, connect the GitHub repository and keep `Dockerfile.vercel` at the project root. Vercel will build it as a container function. Set these environment variables in the Vercel project:

```text
FLAG=flag{your_real_flag_here}
SESSION_SECRET=use-a-long-random-secret
```

`SESSION_SECRET` keeps players from forging their pass cookie directly when the source is public. The player session is stored in a signed cookie so the challenge works reliably on stateless hosts.
