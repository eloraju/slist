# The self-hosting contract: one `PUBLIC_URL`, migrations on boot, generated secret

`docker compose up` with a copied `.env` must produce a working app. Two
services (`app`, `postgres`), one named volume, a Postgres healthcheck gating
`depends_on`, and the React frontend served by the same `Bun.serve` process as
the API and the WebSocket — one container, same origin, no CORS.

Three decisions weighted toward first-run success:

- **Migrations run automatically on startup**, before the server binds. Pulling
  a new image just works. The two-replicas-racing risk is irrelevant on a
  single-instance homelab deploy.
- **The auth signing secret is generated on first boot and persisted in the
  database** if not supplied. It sits next to the session rows it protects, so
  it leaks nothing a database compromise would not already give up, and it makes
  the zero-config path real rather than a crash on first run.
- **One `PUBLIC_URL` env var** (e.g. `https://lists.example.com` or
  `http://192.168.1.50:3000`) is the single source of truth for the session
  cookie's `Secure` flag, the WebSocket URL the client dials, and the origin
  baked into Invite links.

`PUBLIC_URL` exists because neither auto-detection nor a blanket assumption
works: some operators run plain HTTP on a LAN address, others sit behind Caddy
or Traefik where the app sees HTTP but the browser sees HTTPS. Trusting
`X-Forwarded-Proto` is a lie if the app is also reachable directly. Deriving
Invite links from the request `Host` header is how self-hosted apps end up
handing people `http://localhost:3000/invite/...`.
