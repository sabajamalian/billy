This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Self-hosting with Docker

Billy is designed for self-hosting as a single Docker image. From the repository root, create or update `.env`, then run:

```bash
docker compose up -d --build
```

The compose file loads `.env` with `DATABASE_URL`, `ADMIN_PASSWORD`, Billy settings such as `BILLY_OCR_MODELS`, `BILLY_BILL_TTL_DAYS`, `BILLY_DAILY_LLM_COST_USD`, `BILLY_PER_BILL_RETRY_LIMIT`, `BILLY_PER_IP_SCAN_LIMIT`, and the optional `BILLY_KEY_ENCRYPTION_SECRET` (see below), plus provider keys such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GOOGLE_GENERATIVE_AI_API_KEY` when those OCR models are enabled. The container defaults to `DATABASE_URL=file:/app/data/billy.db`; the compose bind mount stores that database under `./data` on the host.

For OCR, set `BILLY_OCR_MODELS` to a comma-separated `provider:model` list — for example `"anthropic:claude-sonnet-4-5,openai:gpt-5.4,google:gemini-2.5-flash"`. Running at least two providers enables genuine voting between them. The admin panel at `/admin` lets you toggle the active set at runtime; the env var becomes the fallback for first boot.

### Provider API keys

You can supply provider API keys two ways:

1. **Environment variables** (recommended for hardened deployments) — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`.
2. **Admin → Keys tab** at runtime — keys are encrypted with AES-256-GCM and stored in the SQLite `AdminSetting` table. Stored keys take precedence over env vars; clear them to fall back to the env var.

The encryption master key is sourced from `BILLY_KEY_ENCRYPTION_SECRET` (64 hex chars, 32 bytes) if set, otherwise auto-generated and persisted at `data/.encryption-key` (mode 0600). For Docker/Kubernetes deploys, prefer setting `BILLY_KEY_ENCRYPTION_SECRET` from your secret manager so the encrypted blobs in the DB are not decryptable just from a stolen DB. If you keep the auto-generated keyfile, back it up alongside `data/billy.db` — losing the keyfile makes any DB-stored API keys unrecoverable.

To rotate the encryption secret, clear all DB-stored keys via the admin panel first (or accept that they will appear as `decrypt failed` and need re-entering), then update `BILLY_KEY_ENCRYPTION_SECRET` and restart.

Set a strong `ADMIN_PASSWORD` in `.env`, start the service, then visit `http://localhost:3000/admin` to access admin features. Keep `.env` private and never commit provider keys or the admin password.

To back up Billy, stop writes if possible and copy `data/billy.db*` from the host; SQLite WAL mode may create `billy.db-wal` and `billy.db-shm` alongside the main database. Uploaded receipt files live under `data/uploads/`.

Billy does not provide built-in TLS or whole-site authentication beyond the admin gate. Put it behind a reverse proxy for HTTPS, host-level access controls, and any additional authentication you require.

