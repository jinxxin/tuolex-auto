# Contributing

[简体中文](CONTRIBUTING.md) ｜ **English**

Thanks for taking the time to improve this tool. Please read this page first — it saves a round trip.

## Open an issue before a PR

- Bugs: include the version, reproduction steps, and the tail of `docker compose logs api`.
- Features: state **the problem you want to solve** first. The Community Edition is maintained on a best-effort basis, with no schedule commitment.
- Larger changes (more than 300 lines, or touching the data model): open an issue to align first, so the work is not wasted.

## Development environment

```bash
npm ci
cd server && npm ci && cd ..
npm run dev            # frontend, Vite (default 5173)
cd server && npm run dev   # backend API (default 3000, requires a local PostgreSQL)
```

Or use containers directly:

```bash
docker compose build
docker compose up -d
```

## Self-checks before committing

```bash
npm run lint
npm run i18n:check
npm run test:fs
npm run build
```

If you changed the server or a Dockerfile, also run `docker compose build` once.

## Code conventions

- TypeScript strict mode; do not escape with `any` (if truly necessary, comment why).
- All user-facing strings go through i18n (`src/locales/zh.json` and `en.json` must have the same keys; `npm run i18n:check` enforces this).
- Every server-side write must be audited (`writeAudit`); do not bypass it.
- New tables/columns go through the idempotent migrations in `server/src/db.ts` (`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`); do not introduce a migration framework.

## License and provenance

- By submitting, you agree to license this contribution under **Apache-2.0**.
- **Do not** submit any standards text (ISO 26262 / A-SPICE PAM / IATF, etc.), customer data, or third-party restricted material.
- If you reference third-party code, state its origin and license in the PR and update `THIRD_PARTY_NOTICES.md`.

## Security issues

See [SECURITY.en.md](SECURITY.en.md); do not open a public issue.
