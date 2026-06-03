# Hunchproof — Mechanism Design

The math and the *why* behind every settled decision. This is the spec; the code in
`research/` and `product/` implements it. Don't change these without understanding the
reasoning — most were arrived at by hitting a wall the naive version walks into.

---

## 1. Outcome space and the proper scoring rule

Each match has three ordinal outcomes: **H > D > A** (home win, draw, away win). A prediction
is a probability vector `p = [p_H, p_D, p_A]`, sums to 1.

**Primary metric: Ranked Probability Score (RPS)** — strictly proper, ordinal-aware (it
knows D sits between H and A). For K=3:

```
RPS(p, y) = 0.5 · [ (CP_1 − CO_1)² + (CP_2 − CO_2)² ]
  where CP = cumulative p = [p_H, p_H+p_D, 1]
        CO = cumulative one-hot of the actual result y
lower is better.
```

**Diagnostic: log-loss** `−log p[y]` (proper but not ordinal; used as a secondary check).

Strictly proper = a forecaster minimizes expected score by reporting their TRUE beliefs.
No incentive to shade. This is foundational; do not replace RPS with a non-proper rule.

---

## 2. The three market snapshots (the spine)

For every match we capture the no-vig market probabilities at three times:

- **`q_open`** — the opening line (when the slate opens / user can first submit).
- **`q_lock`** — the line at `lock_at` (submissions freeze here). Captured by the ingestion
  scheduler AT that instant — it's a timing event, not a stored historical value.
- **`q_close`** — the closing line (just before kickoff). The sharpest public forecast; **our
  benchmark / "the bar".**

**No-vig** = strip the bookmaker margin by normalizing inverse-odds to sum to 1
(proportional method). Both ingestion and scoring use ONE shared no-vig implementation so
they never disagree. Pinnacle is the preferred book (sharp, low-vig).

Why the closing line is the bar: Phase 0 proved on 6 real EPL seasons that the close is
significantly sharper than the open (RPS +0.0015, z = 3.24) and that a competent public
model beats naive baselines but *loses* to the close. So "be closer to the close than the
market was" is a genuinely hard, genuinely valuable target — not a strawman.

---

## 3. CLV vs realized alpha — THE fundamental distinction

Two ways to measure if a forecast was "good":

- **Realized alpha** — did you beat the close *on the actual outcome*? `RPS(q_close) − RPS(p)`.
  Outcome-dependent → HIGH variance. A correct "60% home" call can still lose to a draw.
  One tournament can't establish it. **Long-horizon, cross-season accumulation only.**

- **CLV (Closing Line Value)** — was your distribution closer to `q_close` than the market
  was, *regardless of outcome*? Measured in cross-entropy to `q_close`. Outcome-INDEPENDENT
  → ~half the variance (Phase 0: SE_clv 0.0009 vs SE_alpha 0.0017). Detectable in far fewer
  events. **This is the MVP primary metric.**

> A user who *knows* "this match is probably a home win" has information that shows up in
> realized alpha but **not necessarily in CLV** — because the closing line has already priced
> that in. CLV only rewards information the closing line **hasn't absorbed yet.** This is
> subtle and was a real bug we hit (an "informed" agent tilted toward the result scored
> *negative* CLV). Internalize it: **CLV's reference is the closing line, not the scoreboard.**

---

## 4. Individual reward: excess CLV vs the SUBMIT-TIME market

```
excess_CLV_vs_submit = CE(q_close, q_submit) − CE(q_close, p_user)
```

`q_submit` = the no-vig market AT THE INSTANT THE USER COMMITTED (server-snapshotted).

**Why submit-time, not opening:** otherwise a user could wait until the line has already
moved on news, copy the moved line, and collect "CLV" for drift they didn't anticipate —
**latency arbitrage**. Benchmarking against the market *at their own submit time* makes a
pure copycat's excess CLV **exactly 0** (a near-exact mathematical identity, verified on real
odds in `phase1.py`). Genuine anticipation keeps a positive score; copying earns nothing.

**Engineering corollary:** `q_submit` MUST be snapshotted server-side at commit time and
never trusted from the client. A coarse/stale snapshot reopens the arb seam.

---

## 5. Crowd oracle value (a different question)

```
crowd_CLV_vs_lock = CE(q_close, q_lock) − CE(q_close, crowd_aggregate_pre_lock)
```

Does the pre-lock crowd anticipate the closing line better than the lock market itself?
This is the B2B/oracle question, separate from individual reward.

**Aggregation = log-opinion pool** (weighted geometric mean in clr space), NOT arithmetic
mean — geometric pooling is the right way to combine probability distributions.

**Weighting = robust portfolio, NEVER equal weight.** Gate and weight each contributor by
their excess-CLV **lower-confidence bound**:

```
LCB_i = mean(excess_CLV_i) − 1.64 · SE(excess_CLV_i),  clipped to ≥ 0
weight_i = LCB_i   (contributors with LCB ≤ 0 are dropped)
eligibility also requires reveal_reliability_i ≥ 0.95
```

Phase 1 demonstrated on real odds: an **equal-weight** crowd is dragged NEGATIVE by noise and
copycats (CLV-vs-submit ≈ −0.011); the **robust-weighted** crowd recovers positive CLV with
good calibration. The robust weighting isn't an add-on — it's the thing that makes a noisy
crowd into a useful oracle.

---

## 6. lock_at — where to freeze submissions

A tradeoff (lock_frac: 0 = open, 1 = close):
- lock LATE → `q_lock` ≈ `q_close` → no headroom left to anticipate → CLV signal → 0.
- lock EARLY → big headroom but soft benchmark and immature opinions.

`lock_scan.py` balances **residual headroom** `KL(q_close‖q_lock)` × **benchmark hardness**
(fraction of open→close sharpening already captured). On EPL the balance band is ≈ 0.16–0.45.

**Honest caveat baked into the analysis:** EPL open→close movement is *tiny* (≈0.002 nats) —
the opener is already nearly as sharp as the close, so lock_at barely matters in a mature
league. It matters where lines move more (World-Cup group games: upset-prone, info-dense,
softer openers). **Recalibrate `lock_scan.py` on real World-Cup odds once a few rounds are in.**
The ingestion pipeline already logs `|q_now − q_open| / |q_close − q_open|` per match for this.

---

## 7. Commit–reveal (cryptographic integrity)

**Canonical scheme (v1) — identical in browser and backend, proven byte-for-byte:**

1. quantize `p` to integer permille via largest-remainder (so it sums to exactly 1000 —
   floats are not safe to hash across languages).
2. preimage = `PoF|v1|{match_id}|{H}-{D}-{A}|{salt_hex}`, salt = 32 random bytes (hex).
3. commitment = `SHA-256(utf8(preimage))` hex.

Lifecycle: **commit** (store only the hash; server snapshots `q_submit`) → **lock** (freeze)
→ **reveal** (user sends salt + distribution; server recomputes the hash and accepts only on
exact match) → **score**.

Invariants (regression-tested in `tests/pof_e2e_test.py`):
- store ONLY the commitment hash at commit time — the distribution is invisible pre-reveal.
- reject commits after `lock_at`; one prediction per (user, slate, match).
- **a fulfilled commitment is immutable**; a failed/tampered reveal must not mutate the row.
- reveal before lock is rejected.

The `v1` version tag exists so the scheme can evolve; if you change it, re-prove Python==JS
equality and bump the version.

---

## 8. Anti-cherry-picking

Selection bias is removed at the source, not patched statistically:
- **Mandatory pre-committed slates**: the user predicts EVERY match in the slate and commits
  them all at once. They can't later grade only the matches they got right.
- **Coverage + reveal-reliability gates**: incomplete coverage or low reveal reliability
  disqualifies a user from oracle eligibility.
- **Worst-case scoring** for committed-but-unrevealed predictions on the leaderboard.

---

## 9. Acceptance gates

**Phase 0 (research, on real data) — all PASS:**
- G1 closing sharper than opening (precondition for CLV being a valid edge metric)
- G2 market beats climatology (no leakage; benchmark not set too low)
- G3 public model loses to the close (negative control: not a model-gaming toy)
- G4 CLV variance ≪ realized-alpha variance (why CLV is the early metric)

**Phase 1 / live MVP (the real test, on real users):**
- P1 reveal reliability ≥ 95%
- P2 crowd excess-CLV-vs-submit > 0   ← the core "does the crowd have edge" question
- P3 crowd beats a public model vs lock (crowd not explained away by a naive model)
- P4 calibration holds (ECE small — needs a meaningful sample; small-sample ECE is noise)

In the synthetic harness P1–P3 pass *because the crowd contains informed archetypes by
construction* — that validates the gates COMPUTE and DISCRIMINATE (a copycat-only crowd fails
them), NOT that a real crowd has edge. Only real users answer P2/P3 for real.

---

## 10. Deferred (intentionally not built — none needed to answer P2/P3)

Full on-chain settlement beyond a per-round Merkle root; soulbound calibration badges
(EAS / ERC-5192); pluggable ZK proof-of-personhood at the payout layer for sybil resistance;
gasless L2 + paymaster; threshold-encryption / homomorphic aggregation endgame. The MVP is
deliberately operator-holds-plaintext + commit-reveal: auditable, not yet fully trustless.
