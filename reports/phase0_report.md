# Proof of Foresight — Phase 0: The Closing-Line Bar
A reproducible pipeline showing why public models can beat naive baselines
but fail to beat the market's final line.

==================================================================
DATA PROVENANCE: SYNTHETIC DEMO DATA — pipeline validation only, NOT empirical evidence.
==================================================================

## Method
  odds source        : opening = Pinnacle×1520
                       closing = Pinnacle-closing×1520
  matches ingested   : 1520   complete-odds: 1520   dropped: 0 (missing result/odds or non-H/D/A)
  model-scored (OOS) : 1460
  bookmaker margin   : opening 5.00%   closing 2.50%
  no-vig method      : proportional (basic) de-vig
  scoring rule       : RPS (ordinal H>D>A, strictly proper); log-loss diagnostic
  model              : rolling shrunk-Poisson, walk-forward; trained on prior matches only; burn-in 60; team needs >=3 prior games
  climatology        : rolling/expanding with Dirichlet prior (no full-sample peek)
  leakage policy     : every forecast uses only pre-match information

## 0. Acceptance gates (read these first)
  [G1] line efficiency (HARD precondition): PARTIAL  — close beats open by +0.0011 (z=+1.28)
       if FAIL, CLV anticipates noise -> the CLV-based MVP is NOT valid here (switch league/window)
  [G2] climatology is the floor          : PASS  — market lines beat rolling climatology
  [G3] public model loses to closing     : PASS  — model 0.2145 vs closing 0.2089; realized alpha -0.0056
  [G4] CLV var << realized-alpha var      : PASS  — SE_clv 0.0008 vs SE_alpha 0.0015

## 1a. Full-sample market baselines — RPS (lower = better)
  rolling climatology                RPS = 0.2309
  opening (no-vig)                   RPS = 0.2101
  market-average closing             RPS = 0.2090
  CLOSING (no-vig)  <- THE BAR       RPS = 0.2090

## 1b. Model-scored sample — fair like-for-like comparison
  rolling climatology                RPS = 0.2310
  opening                            RPS = 0.2101
  CLOSING  <- THE BAR                RPS = 0.2089
  rolling-Poisson model (OOS)        RPS = 0.2145
  (baselines restricted to the SAME matches the model scores.)

## 2. Line efficiency  (RPS_open - RPS_close, paired over outcomes)
  positive => closing more accurate than opening. PRECONDITION for CLV as an edge metric:
  if it fails, CLV measures anticipation of noise, not of genuine information.
  mean=+0.0011  SE=0.0009  (n=1520)  z=+1.28 -> NOT significant at 90%

## 3. Model vs the closing line
  realized alpha vs CLOSING (outcome-based, HIGH variance): mean=-0.0056  SE=0.0015  (n=1460)  z=-3.67 -> significant at 90%
  realized alpha vs OPENING  (outcome-based):              mean=-0.0044  SE=0.0017  (n=1460)  z=-2.59 -> significant at 90%
  pre-outcome CLV vs closing (no outcome used, LOW var):   mean=-0.0077  SE=0.0008  (n=1460)  z=-10.03 -> significant at 90%

## 4. Reading this
  - The closing line is the bar; a simple public model should NOT beat it.
  - realized-alpha-vs-closing is high variance -> usually undetectable over a short
    horizon even if a real edge exists. CLV integrates out the outcome.
  - => MVP success = positive pre-lock CLV from an auditable, pre-committed,
    non-cherry-picked slate with good calibration; realized alpha accumulates
    across seasons — never a one-tournament verdict.