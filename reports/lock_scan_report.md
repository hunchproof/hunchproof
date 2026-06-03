# Proof of Foresight — Step 1: siting lock_at on real data
Where to freeze submissions, from REAL Pinnacle open+close odds.

====================================================================
DATA: REAL football-data.co.uk Pinnacle open+close, 2110 matches, 2020-09-12 → 2026-01-08
OBJECTIVE: geometric mean of (residual headroom) × (benchmark hardness) — two
           REAL, independently-motivated quantities in opposite tension.
====================================================================

  total open->close headroom  KL(q_close||q_open) = 0.0024 nats
  RPS(opening) = 0.1968    RPS(closing) = 0.1953    (sharpening = +0.0015)

  *** KEY REAL FINDING ***
  In this league the open->close headroom is TINY (≈0.002 nats): the EPL opening
  Pinnacle line is already almost as sharp as the close. Consequence: lock_at is
  nearly INSENSITIVE here — there is barely any movement to be early for. The
  lock_at tradeoff only bites in markets/competitions with LARGER line movement
  (more news, softer openers). World-Cup group games — upset-prone, info-dense,
  with softer early lines — likely move MORE than mature EPL markets, so lock_at
  matters more there. Re-run this scan on real World-Cup odds to set it for real.

## Scan over lock_frac  (0 = lock at open, 1 = lock at close)
   frac  headroom KL  head.norm  RPS@lock  hardness  objective
   0.00       0.0024       1.00    0.1968      0.00      0.000
   0.04       0.0022       0.92    0.1967      0.06      0.234
   0.08       0.0020       0.84    0.1966      0.12      0.315
   0.12       0.0019       0.77    0.1965      0.17      0.366
   0.16       0.0017       0.70    0.1964      0.23      0.400 .band
   0.20       0.0015       0.63    0.1964      0.28      0.423 .band
   0.24       0.0014       0.57    0.1963      0.33      0.436 .band
   0.29       0.0012       0.51    0.1962      0.38      0.442 .band
   0.33       0.0011       0.45    0.1961      0.43      0.443  <= peak
   0.37       0.0010       0.40    0.1961      0.48      0.438 .band
   0.41       0.0008       0.35    0.1960      0.52      0.428 .band
   0.45       0.0007       0.30    0.1959      0.57      0.415 .band
   0.49       0.0006       0.26    0.1959      0.61      0.398
   0.53       0.0005       0.22    0.1958      0.65      0.378
   0.57       0.0004       0.18    0.1957      0.69      0.355
   0.61       0.0004       0.15    0.1957      0.73      0.330
   0.65       0.0003       0.12    0.1956      0.76      0.302
   0.69       0.0002       0.09    0.1956      0.80      0.273
   0.73       0.0002       0.07    0.1955      0.83      0.241
   0.78       0.0001       0.05    0.1955      0.86      0.207
   0.82       0.0001       0.03    0.1954      0.89      0.173
   0.86       0.0000       0.02    0.1954      0.92      0.136
   0.90       0.0000       0.01    0.1954      0.94      0.098
   0.94       0.0000       0.00    0.1953      0.97      0.060
   0.98       0.0000       0.00    0.1953      0.99      0.020

## Recommendation
  Balance point: lock_frac ≈ 0.33; robust band ≈ 0.16–0.45
  (where the objective is within 90% of its max). Treat it as a BAND, not a constant.
  At the balance point:
    - 45% of the open->close movement is still ahead of users
    - the benchmark already captures 43% of the sharpening

## How to use this on the real timeline
  lock_frac is clr-distance along open->close, not wall-clock. During the tournament
  the ingestion pipeline should log |q_now - q_open| / |q_close - q_open| per match;
  set lock_at at the minutes-before-kickoff where that ratio typically reaches the
  chosen frac. Recalibrate on World-Cup odds after a few rounds (cup ≠ league).

  Direction is the robust result: lock NEITHER at open (benchmark too soft, users just
  copy a stale line) NOR at close (no headroom; CLV has nothing to beat). Somewhere in
  the middle band. In a low-movement league the exact point barely matters; in a
  high-movement event it does.