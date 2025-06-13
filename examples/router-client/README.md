# Router + Client Example

This demo shows how to use the built-in HTTP router together with the browser client.
It exposes `/auth/*` routes via Hono and serves a minimal HTML page that uses the
client to sign up, sign in and sign out.

## Quick start

```bash
bun install
bun run dev    # or: npm run dev
```

Open `http://localhost:8787` in your browser.
