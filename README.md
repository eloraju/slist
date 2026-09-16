# bun-react-template

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

This project was created using `bun init` in bun v1.3.6. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Configuration

`PUBLIC_URL` is the single source of truth for the origin (ADR-0008): the session cookie's `Secure`
flag, the WebSocket URL and the origin in Invite links all come from it. slist must be served from
the **root of its origin** — a path prefix such as `https://example.com/lists` is not supported and
is refused at boot. Put it behind a subdomain instead.
