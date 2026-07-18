# web

A small web challenge for an event access portal.

## Flag

Set a custom flag with the `FLAG` environment variable. The default is:

```text
flag{access_update_complete}
```

## Files

- `server.js` - challenge server
- `public/styles.css` - UI styling
- `verify.js` - automated health check
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
