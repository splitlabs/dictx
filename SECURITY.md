# Security Policy

## Reporting a vulnerability

Please report security issues privately through
[GitHub private vulnerability reporting](https://github.com/splitlabs/dictx/security/advisories/new)
rather than a public issue. You can also email hello@splitlabs.io.

Include what you found, the affected commit or release, and steps to reproduce.
We aim to acknowledge reports within 3 working days.

## Supported versions

Only the latest release and the `main` branch receive security fixes.

## Past incidents

**2026-03 to 2026-09: injected payload in `tailwind.config.js`.** Commits on `main` and
several branches carried an obfuscated script appended to `tailwind.config.js` after a
long run of whitespace. It was removed from every branch on 2026-09-17.

- Published release binaries (v0.2.0, v0.3.0) were built on 2026-03-03, before the
  injected commit, from tags that do not contain the payload.
- The app builds with Tailwind v4 (`@tailwindcss/vite`) and does not load
  `tailwind.config.js`, so a normal `bun run dev` or `tauri build` did not execute it.
  Editor Tailwind extensions, Tailwind v3 tooling, or any script that imported the file could.
- If you cloned or opened this repository between 2026-03-11 and 2026-09-17, follow the
  checks in [issue #30](https://github.com/splitlabs/dictx/issues/30) and rotate
  credentials if anything is found.

A CI check (`.github/workflows/config-integrity.yml`) now fails on this payload shape.
