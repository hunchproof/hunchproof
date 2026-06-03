# Hunchproof — Project Brief for Claude Code

> **hunchproof.com** · turn your hunch into proof.
> An **auditable market-residual intelligence engine** for football prediction.
> A *belief market, not a money market.* NOT a sportsbook, NOT a prediction/betting market.

You (Claude Code) are picking up a project that already has a validated research
foundation and a tested, end-to-end runtime. This file is your map. Read it fully
before writing code. Then read `docs/ARCHITECTURE.md` and `docs/MECHANISM.md`.

---

## What this product is, in one paragraph

Users commit a **sealed probability distribution** over a football match outcome
(Home / Draw / Away) **before kickoff** (cryptographic commit-reveal). After the match,
each prediction is scored by a **strictly-proper rule (RPS)** against the market's
**closing line** — the sharpest public forecast that exists. The metric that matters is
**CLV (Closing Line Value) benchmarked at the user's submit time**: were you closer to the
eventual closing consensus than the market was *when you called it*? Predictions that beat
the market *before it moved* accrue to an unfakeable track record, and the best forecasters
aggregate (robust-weighted) into a **crowd oracle**. Two scores forever: absolute
calibration (engagement leaderboard) and market-relative edge (oracle weight / B2B value).

---

## NON-NEGOTIABLE design constraints (do not violate these when building)

These were derived over a long design process and validated on real data. Breaking any of
them silently breaks the product's integrity. If a task seems to require breaking one, STOP
and flag it.

1. **The benchmark is the closing line, NOT the match result.** A user's edge is measured
   as how much closer their distribution is to `q_close` than the market was. Tilting toward
   the realized outcome is *realized alpha* (high variance, long-horizon only), NOT the
   primary metric. See `docs/MECHANISM.md` §"CLV vs realized alpha".

2. **Individual reward = excess CLV vs the SUBMIT-TIME market**, not vs the opening line:
   `excess_CLV = CE(q_close, q_submit) − CE(q_close, p_user)`.
   This is the **latency-arbitrage defense**: a user who waits for the line to move and
   mirrors it earns *exactly zero* (proven as an identity). Benchmarking vs opening would
   reward copying drift. NEVER benchmark individual reward against the opening line.

3. **The server snapshots `q_submit` authoritatively at commit time.** Never trust a
   client-supplied market price. This is the engineering anchor of the latency-arb defense.

4. **Commitment binds; reveal verifies.** Store only the commitment hash at commit time
   (the distribution is invisible to the server pre-reveal). Reveal recomputes SHA-256 with
   the canonical scheme and accepts only a byte-for-byte match. **A fulfilled commitment is
   immutable** — a failed/tampered reveal must NEVER mutate a stored prediction.

5. **No selective non-reveal.** Committed-but-unrevealed predictions are scored
   **worst-case** on the leaderboard; oracle eligibility is gated on reveal reliability ≥ 95%.
   Mandatory pre-committed **slates** (predict every match, commit all at once) remove
   cherry-picking at the source.

6. **The oracle is robust-weighted, NEVER equal-weighted.** Contributors are gated and
   weighted by their excess-CLV lower-confidence bound (`mean − 1.64·SE`, clipped ≥ 0).
   Equal-weight aggregation provably dies on a noisy crowd; robust weighting IS the product.

7. **Two separate scores, always.** Absolute calibration (leaderboard) and market-relative
   CLV/alpha (oracle weight) are never merged. A market-copier can top the absolute board
   yet carry ~zero oracle weight — this is by design, not a bug.

8. **Canonical commitment scheme (must match across browser + backend, byte-for-byte):**
   - quantize the distribution to integer permille (largest-remainder, sums to 1000)
   - preimage string: `PoF|v1|{match_id}|{H}-{D}-{A}|{salt_hex}` (salt = 32 random bytes hex)
   - commitment = SHA-256(utf8(preimage)), hex
   This is verified identical in Python and JS in `product/commitment_reference.py`.
   **Do not change the scheme** without re-proving cross-language equality and versioning it
   (the `v1` tag exists for this).

9. **It is not betting.** Keep this boundary in every user-facing string and external doc.
   No staking on outcomes; users prove the *quality* of probabilistic foresight. This protects
   positioning AND reduces regulatory surface.

---

## Repository layout

```
hunchproof/
├── CLAUDE.md                 ← you are here
├── docs/
│   ├── ARCHITECTURE.md       system design, data flow, the three-snapshot pipeline
│   ├── MECHANISM.md          the scoring math + every settled design decision & why
│   ├── STATUS.md             what's proven vs not, what's built vs not (honest boundary)
│   ├── ROADMAP.md            concrete next tasks for you, in priority order
│   └── GLOSSARY.md           RPS, CLV, q_open/lock/close, no-vig, slate, etc.
├── research/                 the measurement layer (validated on real data)
│   ├── phase0.py             closing-line bar + 4 acceptance gates  [REAL data]
│   ├── phase1.py             shadow-contest scoring harness + CLV defense
│   ├── lock_scan.py          where to set lock_at (headroom × hardness)
│   ├── engine.py             mechanism primitives library
│   ├── simulate.py / simulate_alpha.py   mechanism-validation sims (regression suite)
├── product/                  the runtime (end-to-end tested)
│   ├── pof_backend.py        FastAPI + SQLite: fixtures/commit/reveal/leaderboard
│   ├── ingestion.py          fixtures + 3-snapshot odds pipeline + auto-scoring
│   ├── live_odds_source.py   The-Odds-API adapter (drop in a key)
│   ├── commitment_reference.py   canonical commit scheme (Py, proven == JS)
│   ├── predict_terminal.html single-match commit terminal (early MVP)
│   ├── hunchproof_app.html   FULL 4-view product frontend (the real UI)
│   ├── mvp_schema.sql        production Postgres schema (SQLite mirrors it)
│   └── run_local.sh          one command: backend + frontend, wired
├── tests/
│   ├── pof_e2e_test.py       full lifecycle + reveal-immutability regression
│   └── integration_test.py   pipeline + backend share one DB; auto-scoring works
├── reports/                  generated evidence (markdown + PNG figures + per-match CSV)
├── brand/                    naming, positioning, one-liner (中英)
└── external/                 investor one-pager (HTML)
```

---

## Current status (see docs/STATUS.md for the honest, detailed version)

**Proven on REAL data** (6 EPL seasons, 2,110 matches, Pinnacle open+close):
closing line is a hard, well-calibrated bar (RPS ≈ 0.195); the line moves on information
(close beats open, z = 3.24); a competent out-of-sample public model loses to the line;
CLV has ~half the variance of realized alpha → correct primary metric; commit→lock→reveal→
score pipeline runs end-to-end; latency-arb defense holds as an identity; browser→backend
live loop tested (slate loads from server, commits land, q_submit server-snapshotted).

**NOT yet claimed / NOT yet done:** that a real crowd has edge (the Phase-1 crowd is
synthetic by construction — it validates the *ruler*, not real alpha). The one open
question, answerable only with real users: **does a committed crowd produce positive
pre-lock CLV?** That is what the live shadow contest tests.

**Remaining work is operational + the build tasks in ROADMAP.md.** The two things only the
real world can supply: a paid odds-API key, and real users.

---

## How to run what already exists

```bash
# reproduce the research evidence (needs football-data.co.uk CSVs in research/real_data/)
cd research && python phase0.py --datadir real_data --outdir ../reports
              python phase1.py --datadir real_data --outdir ../reports
              python lock_scan.py --datadir real_data --outdir ../reports

# run the product locally (backend + frontend wired), no API key needed
cd product && ./run_local.sh                 # then open the printed URL
# or seed real fixtures from history:  ./run_local.sh --replay ../research/real_data

# tests
cd tests && python pof_e2e_test.py && python integration_test.py
```

Stack: Python 3.11+, FastAPI + uvicorn, SQLite (dev) → Postgres (prod via mvp_schema.sql),
numpy/pandas/scipy/matplotlib for research. Frontend is single-file HTML/JS (no build step),
talks to the backend via `?api=<backend-url>` or `window.POF_API_BASE`.

---

## Your first move, Claude Code

1. Read `docs/MECHANISM.md` and `docs/ARCHITECTURE.md` so you don't violate the 9 constraints.
2. Read `docs/ROADMAP.md` — it lists the concrete next build tasks in priority order.
3. Skim `docs/STATUS.md` so you never over-claim in code comments, UI copy, or docs.
4. The existing code is tested and working — extend it, don't rewrite it. When you change the
   commitment scheme, schema, or scoring, re-run the tests in `tests/` and keep them green.
