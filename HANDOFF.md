# Dictx — Codex Handoff

## What Is Dictx

Dictx is a cross-platform desktop speech-to-text app. Press a shortcut, speak, get text pasted into any field. 100% local — no cloud, no API keys.

- **Stack**: Tauri 2.x (Rust backend) + React/TypeScript frontend
- **Forked from**: [Handy](https://github.com/cjpais/Handy) by cjpais
- **License**: GPL-3.0-or-later
- **Repo**: https://github.com/0xNyk/dictx
- **Current version**: v0.3.0 (published)

## Current Monetization Model

Open source code + paid signed macOS binary. No feature gating, no license keys, no in-app entitlement (Pattern A).

| What                                       | Price          | Channel                                                                            |
| ------------------------------------------ | -------------- | ---------------------------------------------------------------------------------- |
| Source code                                | Free (GPL-3.0) | GitHub                                                                             |
| Signed, notarized macOS DMG + auto-updates | $29 one-time   | [dictx.splitlabs.io/buy](https://dictx.splitlabs.io/buy) (Stripe Managed Payments) |

Purchase link appears in: `AboutSettings.tsx`, `Sidebar.tsx`, `README.md`, `.github/FUNDING.yml`

Download flow: Stripe Checkout Session is verified server-side on each download request; a verified session mints a short-lived presigned URL to the DMG in a private Cloudflare R2 bucket. See `docs/commercial/checkout-migration.md`.

## Competitive Landscape

| Competitor   | Price                   | Key Differentiator                                           |
| ------------ | ----------------------- | ------------------------------------------------------------ |
| VoiceInk     | $39 one-time            | macOS only, polished UI, custom vocabulary                   |
| MacWhisper   | $29–$80                 | macOS only, batch transcription, file import                 |
| Superwhisper | $10/mo or $249 lifetime | macOS only, AI modes, writing styles                         |
| Dictx        | $29 one-time            | Cross-platform, open source, Obsidian integration, 13 models |

Dictx advantages: cross-platform (macOS/Windows/Linux), open source, Obsidian integration, 17 languages, 13 transcription models, CLI control, no subscription.

Dictx gaps vs competitors: no batch file transcription, no AI writing modes, no custom vocabulary training, no transcript editing UI, no analytics/usage stats.

## Architecture Quick Reference

```
src-tauri/src/
├── lib.rs                    # Tauri setup, plugin registration, manager init
├── settings.rs               # All app settings (886 lines)
├── managers/
│   ├── audio.rs              # Audio recording, device management
│   ├── model.rs              # Model download/management (50k lines)
│   ├── transcription.rs      # STT pipeline (27k)
│   └── history.rs            # SQLite history storage (20k)
├── commands/                 # Tauri command handlers (frontend ↔ backend)
├── audio_toolkit/            # Low-level audio: recorder, resampler, VAD
├── shortcut/                 # Global keyboard shortcuts (rdev + handy-keys)
├── overlay.rs                # Recording overlay window
├── tray.rs                   # System tray with i18n
├── cli.rs                    # CLI flags (clap)
├── obsidian_export.rs        # Obsidian vault integration
├── llm_client.rs             # Post-processing LLM client
└── apple_intelligence.rs     # macOS 26 Apple Intelligence integration

src/
├── App.tsx                   # Root: onboarding flow → main app
├── stores/settingsStore.ts   # Zustand store (580 lines)
├── stores/modelStore.ts      # Model state management
├── bindings.ts               # Auto-generated Tauri type bindings (tauri-specta)
├── components/
│   ├── settings/             # 35+ settings components
│   ├── onboarding/           # First-run: permissions → model selection
│   ├── model-selector/       # Model download/switch UI
│   ├── ui/                   # Shared UI primitives
│   └── Sidebar.tsx           # Navigation + Pro CTA
├── overlay/                  # Recording overlay (separate Tauri window)
└── i18n/locales/             # 17 locales, 392 keys each
```

### Key Patterns

- **Manager Pattern**: Audio, Model, Transcription managers init at startup via Tauri state
- **Command-Event**: Frontend → Backend via Tauri commands; Backend → Frontend via events
- **Pipeline**: Audio → VAD (Silero) → transcribe-rs → Text → Clipboard/Paste
- **State**: Zustand → Tauri Command → Rust State → tauri-plugin-store persistence
- **i18n**: All strings via i18next, ESLint enforced, 17 locales synced via `bun run check:translations`

## Development Commands

```bash
bun install                                    # Install deps
CMAKE_POLICY_VERSION_MINIMUM=3.5 bun run tauri dev   # Dev mode
bun run tauri build                            # Production build
bun run lint && bun run format:check           # Pre-commit checks
bun run check:translations                     # Verify all 17 locales in sync
```

Required model for dev:

```bash
mkdir -p src-tauri/resources/models
curl -o src-tauri/resources/models/silero_vad_v4.onnx https://blob.handy.computer/silero_vad_v4.onnx
```

## Release Process

1. Bump version in 3 files: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
2. Commit, PR, merge to main
3. Trigger release: `gh workflow run release.yml --repo splitlabs/dictx`
4. GitHub Actions creates a draft GitHub release (tag + generated notes, no
   binary assets), builds and notarizes both macOS targets, publishes the
   signed DMG to private R2 and the updater bundle to public R2, then writes
   `latest.json` to the public update feed
5. Edit the draft release notes, publish. The update feed goes live at step 4,
   before this, so publish the draft promptly; `latest.json` links to the
   releases list rather than the draft's tag page, which is private until
   published

Platforms built in CI: macOS only (aarch64-apple-darwin, x86_64-apple-darwin).
Windows and Linux are not released; `build-test.yml` and `pr-test-build.yml`
still build all platforms for manual QA artifacts, they just don't publish
anywhere.
macOS builds require Apple signing certs plus R2 credentials in CI secrets
(see `docs/commercial/checkout-migration.md`).

## What Was Just Completed (v0.3.0)

All merged to main as of 2026-03-03:

### PR #6 — Product Improvements (13 items across 3 tiers)

**Tier 1 — Core UX Polish:**

- Recording duration timer in overlay
- Delete confirmation dialog (native Tauri `ask()`)
- History search + saved filter
- Overlay theme colors (CSS variables instead of hardcoded)
- Pro CTA in sidebar

**Tier 2 — Competitive Features:**

- Model download ETA + size display
- Keyboard shortcuts help dialog (press `?`)
- Copy All history transcriptions
- Model use-case hints in onboarding

**Tier 3 — Accessibility:**

- ARIA labels on history buttons
- Sidebar keyboard navigation (role="button", tabIndex, focus ring)
- WCAG AA contrast fix (replaced opacity-50 with text-mid-gray)
- Micro-animations on history actions

### PR #9 — i18n Translations

- 34 new keys added to all 16 non-English locales
- Fixed dot-splitting bug in parakeet model ID keys

### Other PRs

- #5: Permission onboarding UX fix for app updates
- #7: Version bump to 0.3.0
- #8: Housekeeping (cargo fmt, tray SVG, gitignore)

## Known Issues

1. **onnxruntime crash on quit** — `LoggingManager::~LoggingManager()` destructor crashes during `exit()` → `__cxa_finalize_ranges`. Pre-existing ONNX Runtime static destructor ordering bug. Not caused by our changes. Low priority — only crashes on exit, no data loss.

2. **macOS TCC invalidation on binary swap** — Replacing `.app` via `cp -R` invalidates accessibility trust silently. macOS shows toggle as "on" but `AXIsProcessTrusted()` returns `false`. Fix: `tccutil reset Accessibility com.0xnyk.dictx` then relaunch. The onboarding flow handles this gracefully for end users.

3. ~~No macOS DMG in CI~~ — Resolved: `release.yml` builds, signs, and notarizes macOS DMGs and publishes them to R2 (see `docs/commercial/checkout-migration.md`). Still needs Apple signing certs and R2 credentials configured in GitHub Actions secrets before the first real run.

## Monetization Roadmap

### Phase 1: Strengthen Current Model (v0.4.x)

The $29 one-time model has moved off Gumroad onto Stripe checkout at `dictx.splitlabs.io/buy` (see `docs/commercial/checkout-migration.md`), and the auto-update feed (below) now works, so the surface-area gap this section originally described is smaller.

**Immediate revenue tasks:**

- [x] **Landing page** — Dedicated product page (`dictx.splitlabs.io`), not just the GitHub README.
- [ ] **Landing page optimization** — Better screenshots, feature list, comparison table, testimonials placeholder
- [ ] **In-app upgrade prompts** — Currently just a text link in sidebar and About. Add contextual prompts: after first successful transcription ("Love Dictx? Get Pro for auto-updates"), after 50 transcriptions, after model download
- [x] **Auto-update infrastructure** — `tauri-plugin-updater` points at the public feed `https://updates.dictx.splitlabs.io/latest.json`; CI publishes it on every release.

**Files to modify:**

- `src-tauri/tauri.conf.json` — updater `endpoints` (`https://updates.dictx.splitlabs.io/latest.json`) and `pubkey`
- `src/components/update-checker/UpdateChecker.tsx` — already exists
- `src/components/Sidebar.tsx` — Pro CTA placement
- `src/components/onboarding/Onboarding.tsx` — post-download CTA

### Phase 2: Expand Value Prop (v0.5.x)

Build features that competitors charge for, keep them in the GPL source, but make the Pro binary the natural way to get them.

**Feature ideas ranked by effort/impact:**

- [ ] **Batch file transcription** — Import audio/video files, transcribe locally. MacWhisper's core feature. Rust backend already has the transcription pipeline; needs file input UI + progress tracking.
- [ ] **Transcript editor** — View/edit/export transcriptions with timestamps. Currently history only shows raw text with copy/delete.
- [ ] **Usage analytics dashboard** — Local-only stats: words transcribed this week, time saved, most-used model. Gamification drives retention.
- [ ] **Custom vocabulary / hotwords** — `CustomWords.tsx` exists but it's basic string matching. Could train per-user word lists that improve accuracy.
- [ ] **Writing modes** — Post-processing presets: "clean up grammar", "formal email", "meeting notes", "bullet points". The post-processing infrastructure exists (`llm_client.rs`), needs preset system.

### Phase 3: Revenue Diversification (v1.0+)

- [ ] **Teams/Enterprise tier** — Shared custom vocabularies, centralized model management, admin controls. Price: $99/seat/year.
- [ ] **API access** — Let other apps trigger Dictx transcription via IPC/CLI. Already partially built (CLI flags exist). Formalize as an API product.
- [ ] **Model marketplace** — Let users share fine-tuned models. Take a cut of premium model sales.
- [ ] **Obsidian plugin companion** — Dedicated Obsidian plugin that integrates deeper than the current export (live transcription panel, audio playback, search across voice notes). Cross-sell with the desktop app.

### Phase 4: Platform Play

- [ ] **Mobile companion** — React Native app that records and syncs to desktop Dictx for transcription. Cross-device workflow.
- [ ] **Browser extension** — Chrome/Firefox extension that adds voice input to any web form via the desktop app.
- [ ] **Dictx Cloud (opt-in)** — For users who want sync, backup, and larger model access. Subscription model alongside the one-time purchase.

## Pricing Strategy Notes

Current: $29 one-time for signed binary. This is deliberately positioned below VoiceInk ($39) and MacWhisper ($29-80) while being cross-platform and open source.

Considerations:

- The one-time model is honest but limits LTV. Consider adding an optional "Supporter" tier ($5/mo) for early access to features + priority support.
- Don't add feature gating to the GPL source — this would violate the spirit of the license and community trust. The Pro value should always be convenience (signing, updates, support), not features.
- The Obsidian user base is a natural market. They value local-first, privacy, and are willing to pay for quality tools. Target them specifically in marketing.

## Commit Conventions

- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation
- `refactor:` code refactoring
- `chore:` maintenance
- Never force-push to main
- Feature branches → squash merge PRs
- Do NOT add `Co-Authored-By` trailers
- Do NOT add "Generated with Claude Code" to PRs

## Files That Matter Most

| File                                    | Why                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------- |
| `src-tauri/tauri.conf.json`             | Version, window config, updater config, bundle settings                   |
| `src-tauri/src/settings.rs`             | All settings definitions and defaults                                     |
| `src-tauri/src/lib.rs`                  | App initialization, plugin registration                                   |
| `src/App.tsx`                           | Onboarding flow, root component                                           |
| `src/stores/settingsStore.ts`           | Frontend state management                                                 |
| `src/i18n/locales/en/translation.json`  | All UI strings (source of truth)                                          |
| `CLAUDE.md`                             | AI agent instructions for this repo                                       |
| `.github/workflows/release.yml`         | Release pipeline (macOS build, sign, notarize, publish to R2)             |
| `docs/commercial/checkout-migration.md` | Stripe checkout + private R2 download flow, secrets, validation checklist |
