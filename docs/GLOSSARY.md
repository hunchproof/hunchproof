# Hunchproof — Glossary

Domain terms used throughout the code and docs. If a term in the code seems opaque, it's here.

- **1X2 / H-D-A** — the three football match outcomes from the home team's view: Home win (1),
  Draw (X), Away win (A/2). A prediction is a probability over these three.

- **RPS (Ranked Probability Score)** — the primary, strictly-proper, ordinal scoring rule.
  Lower = sharper. Rewards being close on the *cumulative* distribution (knows D is between H, A).

- **log-loss** — secondary diagnostic score, `−log p[actual]`. Proper but not ordinal.

- **no-vig (de-vig)** — bookmaker odds include a margin (the "vig"/"juice"). Converting decimal
  odds to probabilities and normalizing them to sum to 1 removes the margin → the market's
  implied *probabilities*. We use the proportional method.

- **q_open / q_lock / q_close** — no-vig market probability vectors at three times: when the
  slate opens, at `lock_at` (submissions freeze), and just before kickoff (the sharpest line).

- **closing line** — `q_close`. The market's final, sharpest public forecast. **Our benchmark.**

- **CLV (Closing Line Value)** — how much closer a forecast is to the closing line than some
  reference was, measured in cross-entropy to `q_close`. **Outcome-independent**, low variance.
  Our primary metric. "Beating the closing line" = positive CLV.

- **excess CLV vs submit** — a user's CLV benchmarked against the market *at their submit time*:
  `CE(q_close, q_submit) − CE(q_close, p_user)`. The latency-arb-resistant individual reward.

- **realized alpha** — beating the closing line *on the actual result*: `RPS(q_close) − RPS(p)`.
  **Outcome-dependent**, high variance, long-horizon only. NOT the primary metric. (See
  MECHANISM §3 — confusing this with CLV is a classic trap.)

- **slate** — a set of matches the user must predict *in full* and commit *all at once*
  (the anti-cherry-picking unit).

- **commit-reveal** — cryptographic two-phase: commit a hash of (distribution + secret salt)
  before lock; reveal the salt + distribution after lock; anyone can recompute and verify the
  call was never changed.

- **salt** — 32 random bytes (hex) mixed into the commitment so the hash can't be brute-forced
  back to the distribution before reveal.

- **permille** — parts per thousand. The distribution is quantized to integer permille (summing
  to 1000) so the committed value is exact and reproducible across languages (floats aren't).

- **log-opinion pool** — combining probability distributions by weighted *geometric* mean
  (equivalently, weighted average in clr space). How the crowd aggregate is formed.

- **clr (centered log-ratio)** — map a probability vector to log-space with mean subtracted;
  the natural space for averaging/interpolating distributions. Inverse is softmax.

- **LCB (lower-confidence bound)** — `mean − 1.64·SE`. Used to gate/weight oracle contributors
  by their excess-CLV LCB (clipped ≥ 0): rewards *reliable* edge, not lucky variance.

- **robust weighting** — the oracle weights contributors by LCB and drops non-positive ones,
  vs naive equal weighting (which a noisy crowd destroys). The robust weighting *is* the oracle.

- **reveal reliability** — fraction of a user's commitments they actually revealed. Gate for
  oracle eligibility (≥ 95%); unrevealed commitments are worst-cased on the leaderboard.

- **lock_at / lock_frac** — when submissions freeze. `lock_frac` ∈ [0,1] is the position along
  the open→close window (in clr-distance), 0 = at open, 1 = at close. (See MECHANISM §6.)

- **headroom** — `KL(q_close ‖ q_lock)`: how much market movement is still ahead of users after
  lock. Shrinks to 0 as lock → close (then there's nothing left to anticipate).

- **climatology** — a naive baseline forecast from rolling base rates of H/D/A. The floor the
  market must beat (it does, easily).

- **EAS / ERC-5192 / proof-of-personhood** — deferred crypto pieces: attestations, soulbound
  (non-transferable) badges for calibration reputation, and sybil resistance. Not in v1.

- **Pinnacle** — a sharp, low-margin bookmaker; the preferred odds source (its lines are close
  to true probabilities, which is why beating its *closing* line is a high bar).

- **the bar** — shorthand for the closing-line benchmark. "Closing line is the bar."
