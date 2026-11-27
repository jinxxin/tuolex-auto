# Security Policy

[简体中文](SECURITY.md) ｜ **English**

## Reporting a vulnerability

Please **do not** report security vulnerabilities through public issues. Choose either private channel:

1. **GitHub private advisory (recommended)**: repository → Security → Advisories → Report a vulnerability (visible to maintainers only)
2. **Email**: `jinxxin@live.com`, with a subject starting with `[SECURITY]`

Whichever you use, please include as much of the following as possible:

- Affected version / commit
- Reproduction steps or a PoC
- Impact (can it bypass authorization, read or write other users' data, does it require login)
- Your preferred disclosure timeline

We will acknowledge receipt and give an initial assessment **within 7 days**; after a fix is released we will credit you in the CHANGELOG (unless you ask to remain anonymous).

## Supported scope

| Version | Security updates |
|---|---|
| Latest release | ✅ |
| Older versions | Not guaranteed; please upgrade |

## Deployer responsibility

This project is a self-hosted tool; the security boundary is the deployer's responsibility:

- Change the default database password and `JWT_SECRET`.
- Do not expose the service directly to the internet without TLS / a reverse proxy / access control.
- Take care of your own database backups and audit log retention.
- This repository contains no standards text; do not import restricted content and then redistribute it.

## Known design trade-offs

- The audit log is a hash chain (tampering is detectable), not a blockchain and not WORM storage.
- Electronic signatures bind to the content hash, but signature certificates and private keys are managed by the deployer.
- No telemetry data is sent by default.
