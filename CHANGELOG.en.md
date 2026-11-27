# Changelog

[简体中文](CHANGELOG.md) ｜ **English**

Format follows Keep a Changelog; version numbers follow SemVer.

## [0.1.0] — 2026-11-27

The first self-hostable version.

### Included

- Local account system: the administrator is created on first launch, with no factory default password; administrators can create/disable users and reset passwords.
- Projects and members, A-SPICE process tree and work products, requirements/traceability matrix, reviews and electronic signatures.
- Hash-chained audit trail (verifiable), change request / problem resolution / configuration management views.
- Basic FMEA; functional safety domain: HARA, safety requirement chain (SG/FSC/TSC), FMEDA, FTA, DFA, Safety Case, confirmation measures, safety plan.
- CSV / JSON export; bilingual UI.
- One-command self-hosting with Docker Compose (PostgreSQL 16 + Node API + nginx static frontend).

### Not included (commercial edition capabilities)

- Standards and regulatory content library (this repository contains no standards text).
- AI scaffolding and AI assistant.
- Cross-product collaboration (BOM / 3D model library).
- Multi-tenancy, trial provisioning, billing.

### Notes

- Demo data consists of fictional cases and is only for exploring the UI; disable it with `SEED_DEMO=false`.
- Audit and signatures are engineering traceability mechanisms; they are not equivalent to a certification body's conclusion.
- SheetJS is vendored in this repository (`vendor/`), so installs and builds do not depend on an external CDN.
