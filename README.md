# WalletRay

**From X replies to validated wallet lists.** A responsive Next.js app for collecting EVM and Solana public addresses from an X conversation, deduplicating recipients, and exporting CSV for an independently reviewed airdrop.

## Features
- Paste an `x.com` / `twitter.com` post URL and scan replies with the official X API.
- Search **recent** (last 7 days) or **full archive** (requires eligible paid X API access).
- Paginated scans (up to 25 pages, 100 posts/page) with progress and cancellation. Each page consumes X API credits; check your plan.
- Include or exclude nested replies; deduplicate by wallet; optionally restrict to one address per X author.
- EVM checksum validation via `ethers`; Solana 32-byte public key validation via `bs58`.
- Filter by chain, inspect the recipient list, download CSV or copy the addresses.
- **Manual import** works without an X API key: paste one reply per line. Entries are unverified self-submissions, **not proof of X participation**.
- No wallet connection, private keys, database, or automatic token transfer in MVP.

## Architecture

```text
Browser (Next.js UI) -> POST /api/scan (access key gated)
                       -> X API v2 Search (recent/all, cursor)
                       -> normalized X replies -> Browser
Browser -> wallet extraction -> checksum/base58 validation -> deduplication -> CSV
```

The bearer token is only read server-side. The app access key is sent by an admin in a request header; it is held **in browser memory only**, not persisted. This is a single-operator MVP, not a multi-tenant SaaS auth system. Don't expose the access key to untrusted users. Protect the deployed endpoint before public rollout.

## Local development

Requires Node.js 20.9+.

```bash
npm install
cp .env.example .env.local
# Set X_BEARER_TOKEN and a long random WALLETRAY_ACCESS_KEY in .env.local
npm run dev
```

Visit http://localhost:3000. Use the "Manual import" tab immediately if you don't have credentials. Run `npm run test`, `npm run typecheck`, and `npm run build` before releasing.

## Vercel

Import this GitHub repo into Vercel, set `X_BEARER_TOKEN` and `WALLETRAY_ACCESS_KEY` in **Project > Settings > Environment Variables**, then redeploy. Never put these values in `NEXT_PUBLIC_*` or commit `.env.local`.

Official X API docs:
- [Search Posts](https://docs.x.com/x-api/posts/search/introduction)
- [Recent Search](https://docs.x.com/x-api/posts/search/quickstart/recent-search)
- [Full Archive](https://docs.x.com/x-api/posts/search/quickstart/full-archive-search)

## Operational limits & security

- Recent search only covers the last 7 days. Older campaigns need full archive access or exported data.
- X search may not index **every** reply, including deleted/protected posts. Nested replies are included by default; filters are applied locally.
- One wallet per X user is **not** Sybil resistance; addresses do not prove ownership, eligibility, or consent.
- **CSV is a candidate list only**. Review eligibility, duplicate identities, scam addresses and applicable legal obligations before sending tokens.
- No token transfers or private-key handling are implemented.
- The scan API is behind a shared admin secret, but there is no per-user quota; add persistent rate limiting, real login, job storage, and billing controls before a public SaaS launch.
- Each X API search request can incur paid reads, and stopping a scan doesn't reverse charges already incurred.
- API rate limits, plan access, pricing, and developer policy may change. See official docs.

## Planned next phase

Persistent campaigns (PostgreSQL), progress jobs/queue, X account OAuth, abuse prevention/anti-Sybil checks, multi-chain extensions, Merkle claim proofs, and optional reviewed multisender workflows.

MIT licensed.
