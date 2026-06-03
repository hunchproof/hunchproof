# Hunchproof — Status: what's proven, what's built, what's not

Keep this discipline in code comments, UI copy, commit messages, and any external doc.
Over-claiming here is the easiest way to destroy credibility with a quant/sharp audience.

---

## Proven on REAL data (6 EPL seasons, 2,110 matches, Pinnacle open+close)

Source reports in `reports/`: `phase0_REAL_report.md` + `.png` + per-match CSV.

- Closing line is a hard, near-perfectly-calibrated benchmark: **RPS ≈ 0.1951**
  (opening 0.1966, rolling climatology 0.2344). Bookmaker margins: opening 3.02%, closing 2.67%.
- **G1** closing sharper than opening: **+0.0015 RPS, z = +3.24** (one-sided p ≈ 6e-4).
  → the precondition that makes CLV a valid edge metric.
- **G2** every market line beats rolling climatology → no leakage, benchmark not too low.
- **G3** a competent out-of-sample public model (rolling Poisson, walk-forward) **loses** to
  the closing line: model RPS 0.2070 vs 0.1951; realized alpha −0.0119 (z = −7.1).
  → negative control: not a system a throwaway model can game.
- **G4** CLV variance ≈ half of realized-alpha variance (SE 0.0009 vs 0.0017)
  → CLV detects edge in far fewer events → correct primary MVP metric.

## Proven in the scoring harness (real odds + SYNTHETIC crowd) — `phase1.py`

- **Latency-arbitrage defense holds as a near-exact identity**: a copycat who mirrors the
  moved line earns excess-CLV-vs-submit ≈ +0.0000, while the same copycat looks like a star
  under a naive vs-opening benchmark.
- **Equal-weight aggregation dies; robust LCB-weighting recovers a calibrated oracle**
  (equal-weight CLV ≈ −0.011 → robust ≈ +0.000x with low ECE on a large sample).
- Gates P1–P4 COMPUTE and DISCRIMINATE (a copycat-only crowd fails them).

## Proven about the lock_at decision — `lock_scan.py`

- Balance band ≈ **0.16–0.45** of the open→close window (EPL).
- **Honest finding:** EPL open→close headroom is *tiny* (≈0.002 nats) → lock_at barely
  matters in a mature league; it matters in higher-movement events (World-Cup group games).
  Must recalibrate on live World-Cup odds.

## Built and end-to-end tested (product)

- `pof_backend.py`: fixtures/commit/reveal/leaderboard endpoints; server-authoritative
  q_submit; reveal recomputes hash byte-for-byte; **fulfilled commitment immutable**
  (a real reveal-overwrite bug was found and fixed; regression in `tests/pof_e2e_test.py`).
- `ingestion.py`: three-snapshot pipeline + lifecycle scheduler + auto-scoring on settle.
- Cross-language commitment scheme proven byte-identical (Python == JS).
- `integration_test.py`: pipeline + backend share one DB; a real prediction auto-scores
  (observed: q_open 0.539 → q_lock 0.517 → q_close 0.513; scored RPS/CLV/alpha).
- `hunchproof_app.html`: full 4-view frontend; **browser→backend live loop tested** (slate
  loads from `/api/fixtures/open`, commits land with server-snapshotted q_submit, distribution
  invisible pre-reveal, zero console errors). Demo mode also works standalone.
- `live_odds_source.py`: The-Odds-API adapter; name-based H/D/A mapping self-tested.

---

## NOT yet claimed / NOT yet true

- **A real crowd has edge.** FALSE so far — unmeasured. The Phase-1 "informed" archetypes were
  *handed* information by construction; that validates the **ruler and the defense**, not real
  alpha. Do not write UI/marketing implying proven crowd edge.
- **The system is profitable / has alpha.** Not claimed. CLV ≠ money; this is a belief market.
- **Calibration (P4) passes on real users.** Unknown — needs a meaningful sample; small-sample
  ECE is noise. In the demo UI P4 is shown as PENDING below a sample threshold, on purpose.

## NOT yet built (and mostly shouldn't be yet)

- Real authentication / accounts (frontend uses a local `user_id`; wire to real auth for live).
- Postgres migration (SQLite is fine for dev/small pilots; `mvp_schema.sql` is the target).
- Reveal flow in the full SPA is stubbed (terminal + backend have it; wire it into the 4-view
  app's Portfolio when you build the live reveal UX).
- Any on-chain component (Merkle anchoring, soulbound badges, ZK personhood) — deferred;
  none needed to answer the one open question.

---

## The one open question (the whole point of going live)

> **Does a committed crowd of real users produce positive pre-lock CLV** from an auditable,
> non-cherry-picked slate?

That is P2/P3 on real users. No amount of frontend, backend, or simulation changes the answer
— it depends on whether real people have information the market hasn't priced. Everything
built so far exists to measure that cleanly when real users arrive. Stay honest about it.
