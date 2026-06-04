# Hunchproof — project briefing for Claude Code

> **hunchproof.com** · "Turn your hunch into proof."
> An **auditable football belief market**. Live on Vercel.
> Deep detail lives in `docs/` (MECHANISM, ARCHITECTURE, STATUS, ROADMAP, GLOSSARY) — read those
> before changing mechanism/scoring. This file is the fast map; it must stay tight.

---

## What it is (and the honest framing — never drift from this)

Users commit a **sealed H/D/A probability** (Home/Draw/Away) over a match **before kickoff**
(cryptographic commit-reveal). After the match each prediction is scored by **RPS against the
market's CLOSING line** (the sharpest public forecast). The core metric is **CLV = excess closeness
to the closing line vs the market at the user's SUBMIT time**. Best forecasters aggregate
(robust-weighted) into a **crowd oracle**.

- It is a **belief market, NOT betting** — no money, no staking, no payouts. This boundary must
  appear in user-visible copy (the landing eyebrow + footer carry it verbatim).
- The Phase-1 crowd is **SYNTHETIC by construction** (demo data is informed archetypes handed
  information). So the product validates the **mechanism, the ruler, and the audit trail — NOT real
  alpha. NEVER claim the crowd has edge / beats the market / wins money.** (See `docs/STATUS.md`.)

---

## Inviolable invariants (do not break — if a task seems to require it, STOP and flag)

1. **Baseline = the closing line, NOT the result.** Tilting toward the realized outcome is
   "realized alpha" (high-variance, secondary/display-only), never the primary metric.
2. **Individual reward = excess CLV vs the SUBMIT-TIME market** (`CE(q_close,q_submit) − CE(q_close,p)`),
   never vs the opening line. (Latency-arb defense: mirroring the moved line earns exactly 0.)
3. **Server snapshots `q_submit` authoritatively at commit time.** Never trust a client market price.
4. **Commit binds; reveal verifies.** Store ONLY the commitment hash at commit (distribution invisible
   pre-reveal). Reveal recomputes SHA-256 byte-for-byte; a fulfilled commitment is **immutable** —
   a failed/tampered reveal must never mutate a stored row.
5. **No selective non-reveal:** unrevealed = worst-cased on the board; oracle eligibility gated on
   reveal reliability ≥ 95%; slates are committed in full (anti-cherry-pick).
6. **Oracle is robust LCB-weighted (`mean − 1.64·SE`, clip ≥ 0), NEVER equal-weighted.**
7. **Two scores are NEVER merged:** absolute calibration (mean RPS, engagement board) vs
   market-relative edge (CLV/oracle weight). A market-copier can top the absolute board and carry ~0
   weight on the oracle board — by design.
8. **Canonical commitment scheme `PoF|v1` (must be byte-identical browser↔backend):**
   quantize to integer permille (largest-remainder, sums to 1000) → preimage
   `PoF|v1|{match_id}|{H}-{D}-{A}|{salt_hex}` (salt = 32 random bytes hex) → `SHA-256(utf8)` hex.
   Don't change it without re-proving Py==JS and bumping the `v1` tag. Refs: `product/commitment_reference.py`,
   `web/src/lib/commitment.ts`; gold-vector hash `c9e215…8142b309`.
9. **Client scoring is DISPLAY-ONLY; the server/ingestion is authoritative** for RPS/CLV/alpha.

---

## Architecture & key paths

- **`web/`** — production frontend: **React + TypeScript + Vite + Tailwind** (the real UI; the old
  `product/hunchproof_app.html` is a legacy single-file reference).
  - Routing (`web/src/router.tsx`): animated **landing at `/`** (`views/LandingView.tsx`, own lazy
    chunk); the four product views — **Slate · Portfolio · Leaderboards · Oracle** — live under a
    **pathless `<App/>` layout** at `/slate /portfolio /leaderboards /oracle`; `*` → `/slate`.
  - **Demo vs live mode** (`web/src/config.ts`, resolved once at load): **demo** = synthetic, runs
    fully in-browser, no backend (default); **live** via `?api=<url>` or `VITE_API_BASE`. The landing
    CTA carries `location.search` so a `?api=` entry stays live. The connection badge flips demo/live.
  - View-models in `src/models.ts`; demo producers in `src/demo/`; live API→VM derive in
    `src/api/derive.ts`; typed client `src/api/client.ts` + React Query hooks `src/api/queries.ts`;
    salts persisted client-side in `src/hooks/useCommitVault.ts`.
- **`product/pof_backend.py`** — FastAPI + SQLite. Endpoints: `/api/fixtures/open`,
  `/api/predictions` (commit + list; JOINs `matches` to surface `clv`/`alpha_close`/teams/result),
  `/api/predictions/reveal`, `/api/leaderboard`. `product/ingestion.py` = 3-snapshot odds pipeline
  (q_open/q_lock/q_close) + auto-scoring on settle. `live_odds_source.py` = The-Odds-API adapter
  (reads `ODDS_API_KEY` from env; no key is hardcoded).
- **`research/`** — phase0/phase1/lock_scan (mechanism validated on 6 EPL seasons; see STATUS).
- **`tests/`** — `pof_e2e_test.py` (lifecycle + reveal-immutability), `integration_test.py`
  (needs football-data CSVs in `research/real_data/`, which are NOT in the repo → can't run here).
- **Python:** the machine default `python3` is 3.9.6 (too old). Use **`python3.12`** / the
  `hunchproof/.venv` (fastapi, uvicorn, httpx, numpy, pandas, scipy, pillow). `product/run_local.sh`
  brings up backend + Vite dev, wired.

---

## Conventions

- **Typography system (after this pass, mono = a datum, sans = a label):**
  - **Serif** = Fraunces (`font-disp`) for headlines / wordmark / card titles.
  - **Mono** = IBM Plex Mono for body/caption prose AND all **data values + hashes** (numbers, RPS,
    CLV, %, H/D/A, the PoF·v1 hash) — keep these mono.
  - **`.hp-label`** = Inter sans, uppercase, tight tracking (token in `web/src/index.css`) for
    overlines / pills / badges / table headers / section labels / status tags / gate IDs.
  - Brand: dark bg `#0a0c0e` (`--bg`), signal green `#3ddc97` (`--signal`); `.glass-panel` material
    + `rounded-panel/tile/inner` radii; tokens in `web/src/index.css` + `web/tailwind.config.ts`.
- **Git author is repo-local: `Hunchproof <frank@hunchproof.com>`** (keeps the maintainer's personal
  email out of public history). End commit messages with the Co-Authored-By trailer.
- **Scope discipline:** never touch logic / routing / scoring / the invariants unless that IS the
  task. For visual/mobile work keep the **desktop byte-for-byte unchanged** (responsive via `sm:`/
  `md:` only). Frozen user-visible strings stay verbatim (esp. the "not a betting market" lines, the
  Oracle P4 PENDING gate, and the "synthetic crowd … not that a real crowd has edge" note).
- Public contact (already public): email `frank@hunchproof.com`, X `@hunch_proof`.

---

## Deployment state

- **Live at hunchproof.com** on **Vercel** (Root Directory = `web`, Vite preset; **auto-redeploys on
  push to `main`**). DNS at **Porkbun**. GitHub: `github.com/hunchproof/hunchproof` (public).
- Recently shipped (latest first; `git log --oneline`):
  - `3f2d6ec` — Open Graph + Twitter Card meta + 1200×630 `web/public/og.png` share card.
  - `ec906f5` — full favicon set + `web/public/site.webmanifest`.
  - `23b2fbe` — responsive mobile top-nav (hamburger + dropdown sheet; desktop unchanged).
  - `53d01aa` — SPA history-fallback rewrite (`web/vercel.json`, required because Root Dir = `web`).
  - `5d647ad` — initial commit (research + backend + full web app).

---

## Verification gates (keep ALL green on any change)

```bash
cd web && npm run test        # Vitest 14/14 — incl. Python==JS commitment hash parity + scoring
cd web && npx tsc --noEmit    # types clean
cd web && npm run build       # clean; static dist/
# backend (from repo root, using the 3.12 venv):
POF_DB=/tmp/x.db .venv/bin/python tests/pof_e2e_test.py   # → "ALL CHECKS PASSED ✓"
```

---

## Pending / next (see `docs/ROADMAP.md` + `docs/STATUS.md`)

- **The open question (P2):** does a committed crowd of REAL users produce positive pre-lock CLV?
  Only real users answer it — everything built so far exists to measure it cleanly. Don't fake it.
- Real auth (currently a local `user_id`); Postgres migration (`product/mvp_schema.sql`); live odds
  daemon (needs a paid `ODDS_API_KEY`) + recalibrating `lock_at` on live tournament odds.
- Live-mode oracle aggregation + gates P2–P4 are still **client-side display-only** (the backend
  doesn't expose authoritative crowd aggregation yet); the Oracle view is honest about this.
- On-chain / token pieces are explicitly **deferred** — not needed to answer the open question.
