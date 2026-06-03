# Proof of Foresight — Phase 0: The Closing-Line Bar
A reproducible pipeline showing why public models can beat naive baselines
but fail to beat the market's final line.

==================================================================
DATA PROVENANCE: REAL DATA: 6 file(s) from real_data/ (E0.csv, E0__1_.csv, E0__2_.csv, E0__3_.csv, E0__4_.csv, E0__5_.csv).
==================================================================

## Method
  odds source        : opening = Pinnacle×2110
                       closing = Pinnacle-closing×2110
  matches ingested   : 2280   complete-odds: 2110   dropped: 170 (missing result/odds or non-H/D/A)
  model-scored (OOS) : 2026
  bookmaker margin   : opening 3.02%   closing 2.67%
  no-vig method      : proportional (basic) de-vig
  scoring rule       : RPS (ordinal H>D>A, strictly proper); log-loss diagnostic
  model              : rolling shrunk-Poisson, walk-forward; trained on prior matches only; burn-in 60; team needs >=3 prior games
  climatology        : rolling/expanding with Dirichlet prior (no full-sample peek)
  leakage policy     : every forecast uses only pre-match information

## 0. Acceptance gates (read these first)
  [G1] line efficiency (HARD precondition): PASS  — close beats open by +0.0015 (z=+3.24)
       if FAIL, CLV anticipates noise -> the CLV-based MVP is NOT valid here (switch league/window)
  [G2] climatology is the floor          : PASS  — market lines beat rolling climatology
  [G3] public model loses to closing     : PASS  — model 0.2070 vs closing 0.1951; realized alpha -0.0119
  [G4] CLV var << realized-alpha var      : PASS  — SE_clv 0.0009 vs SE_alpha 0.0017

## 1a. Full-sample market baselines — RPS (lower = better)
  rolling climatology                RPS = 0.2347
  opening (no-vig)                   RPS = 0.1968
  market-average closing             RPS = 0.1952
  CLOSING (no-vig)  <- THE BAR       RPS = 0.1953

## 1b. Model-scored sample — fair like-for-like comparison
  rolling climatology                RPS = 0.2344
  opening                            RPS = 0.1966
  CLOSING  <- THE BAR                RPS = 0.1951
  rolling-Poisson model (OOS)        RPS = 0.2070
  (baselines restricted to the SAME matches the model scores.)

## 2. Line efficiency  (RPS_open - RPS_close, paired over outcomes)
  positive => closing more accurate than opening. PRECONDITION for CLV as an edge metric:
  if it fails, CLV measures anticipation of noise, not of genuine information.
  mean=+0.0015  SE=0.0005  (n=2110)  z=+3.24 -> significant at 90%

## 3. Model vs the closing line
  realized alpha vs CLOSING (outcome-based, HIGH variance): mean=-0.0119  SE=0.0017  (n=2026)  z=-7.11 -> significant at 90%
  realized alpha vs OPENING  (outcome-based):              mean=-0.0104  SE=0.0016  (n=2026)  z=-6.66 -> significant at 90%
  pre-outcome CLV vs closing (no outcome used, LOW var):   mean=-0.0251  SE=0.0009  (n=2026)  z=-28.67 -> significant at 90%

## 4. Reading this
  - The closing line is the bar; a simple public model should NOT beat it.
  - realized-alpha-vs-closing is high variance -> usually undetectable over a short
    horizon even if a real edge exists. CLV integrates out the outcome.
  - => MVP success = positive pre-lock CLV from an auditable, pre-committed,
    non-cherry-picked slate with good calibration; realized alpha accumulates
    across seasons — never a one-tournament verdict.