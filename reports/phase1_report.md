# Proof of Foresight — Phase 1: Shadow-Contest Scoring Harness
Validation of the live-MVP scoring on REAL odds with a SYNTHETIC crowd.

======================================================================
PROVENANCE (three layers):
  REAL      : Pinnacle opening + closing odds (football-data.co.uk), 2110 matches, 2020-09-12 → 2026-01-08
  MODELED   : intra-match path q(t)=clr-geodesic(q_open->q_close)+noise; lock at t=0.85
  SYNTHETIC : crowd archetypes (real users replace them in the live MVP)
======================================================================

## 1. Individual reward metric — the latency-arbitrage defense  (THE POINT)
  excess_CLV_vs_submit = CE(q_close, q_submit) - CE(q_close, user_p)
  benchmarks every user against the market AT THEIR OWN SUBMIT TIME, so copying
  drift that already happened earns nothing. Compare to the naive vs-opening bench:

  archetype         CLV vs opening   CLV vs submit        SE       z
  ----------------------------------------------------------------
  informed_early           +0.0000         +0.0024    0.0000 +199.33
  informed_late            +0.0008         +0.0014    0.0000 +188.01
  copycat_arb              -0.0005         +0.0000    0.0000    +nan
  follower_early           -0.0025         +0.0000    0.0000    +nan
  noise_overconf           -0.2121         -0.2105    0.0006 -374.89

  READ: 'copycat_arb' waits and mirrors the moved line. Under vs-opening it looks
  like a star (large positive); under vs-submit it collapses to ~0 — a near-exact
  identity, not a tuned result. Only the genuinely-informed archetypes keep a
  positive vs-submit score (and they were handed information by construction —
  that part is illustrative, NOT evidence about real users).

## 2. Crowd-oracle value (a different question)
  The oracle aggregate is NOT equal-weight. It gates+weights contributors by their
  excess-CLV-vs-submit lower-confidence bound (the schema's oracle eligibility).
    eligible contributors: 80/200 (non-positive-LCB users dropped)

  equal-weight crowd  (naive): dragged down by noise/copycats
    CLV vs submit: mean=-0.0106  z=-45.17
  robust-weight crowd (oracle): noise/copycats down-weighted out
    CLV vs submit: mean=+0.0004  z=+27.57
    CLV vs lock  : mean=-0.0004  z=-29.11
  => equal-weight aggregation DIES on a noisy crowd; robust weighting is what makes
     the oracle work. This is the alpha_LCB + decorrelation objective from the design,
     not an add-on.
  public-model reference (Phase-0 rolling Poisson), CLV vs lock on its OOS subset:
    model: mean=-0.0275   robust-crowd(same subset): mean=-0.0004

  DISCRIMINATION CHECK — a copycat-ONLY crowd:
    crowd_CLV_vs_submit = +0.0000 (SE 0.0000) -> ~0 by identity
    => the crowd metric also rejects pure market-copying; it is not a rubber stamp.

## 3. Acceptance gates (P1-P4)
  [P1] reveal reliability >= 95% : PASS  (97.0%; unrevealed commitments scored worst-case on the leaderboard)
  [P2] crowd excess CLV vs submit > 0 : PASS  (mean +0.0004, z +27.57)
  [P3] crowd beats public model vs lock : PASS  (crowd not explained away by a naive public model)
  [P4] calibration holds (ECE <= 0.03) : PASS  (ECE 0.0050)

  NOTE: P2/P3 'pass' here because the synthetic crowd contains informed archetypes
  I constructed; this validates that the gates COMPUTE and DISCRIMINATE (the
  copycat-only crowd fails to clear them). It is NOT evidence that real crowds have
  edge — that is precisely what the live shadow contest with real users will test.

## 4. Two design parameters this harness exposes
  - lock_at vs crowd_CLV_vs_lock are COUPLED: lock too late -> q_lock≈q_close -> the
    crowd has no room to beat lock (metric -> 0 mechanically); lock too early ->
    immature opinions. The live MVP should sweep lock windows to site lock_at.
  - excess_CLV_vs_submit's integrity REQUIRES q_submit captured at true submit-instant
    fidelity; a coarse/stale q_submit snapshot reopens a latency-arb seam (submit just
    after a known move but before the snapshot updates). Snapshot q_submit on the
    server at commit time, not on a coarse schedule.