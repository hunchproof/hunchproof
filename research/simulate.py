"""
Proof of Foresight — simulation & validation.

Builds a synthetic but realistic football world, a heterogeneous population of
forecasters, and tests three claims OUT-OF-SAMPLE (weights are fit on a training
window, all metrics are read on a disjoint test window — no look-ahead):

  H1  Proper scoring recovers true skill: rank by RPS-skill and the ranking
      converges on each forecaster's true ability as matches accumulate
      (luck washes out).
  H2  Calibration-weighted log-pooling beats the best individual, equal-weight
      pools, and naive baselines — and is competitive with a sharp 'market'.
  H3  The aggregate is sybil-resistant by construction: flood it with random
      accounts and calibration-weighting holds; equal-weighting collapses.

Run:  python simulate.py
"""
from __future__ import annotations
import math
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.stats import spearmanr
import engine as E

RNG = np.random.default_rng(7)
K = 3                       # ordered: Home(0) > Draw(1) > Away(2) by goal diff
N_TEAMS = 32
N_MATCHES = 1500
TRAIN = 1000               # fit weights on [0:TRAIN], evaluate on [TRAIN:]
N_FORECASTERS = 300
MAX_SYBILS = 2000
LABELS = ["Home", "Draw", "Away"]

# ----------------------------------------------------------------------------
# 1. TRUE WORLD — latent team strengths -> Poisson goals -> true 1X2 probs
# ----------------------------------------------------------------------------
FACT = np.array([math.factorial(k) for k in range(11)], dtype=float)


def poisson_pmf(lam: np.ndarray, kmax: int = 11) -> np.ndarray:
    ks = np.arange(kmax)
    lam = lam[..., None]
    return np.exp(-lam) * lam ** ks / FACT[:kmax]


def oneXtwo(lam_h: np.ndarray, lam_a: np.ndarray) -> np.ndarray:
    """1X2 probabilities from two independent Poisson goal counts."""
    ph, pa = poisson_pmf(lam_h), poisson_pmf(lam_a)
    cdf_a = np.cumsum(pa, axis=-1)
    p_a_less = np.concatenate([np.zeros_like(cdf_a[..., :1]), cdf_a[..., :-1]], axis=-1)
    p_home = np.sum(ph * p_a_less, axis=-1)     # P(home goals > away goals)
    p_draw = np.sum(ph * pa, axis=-1)
    p_away = 1.0 - p_home - p_draw
    return E.clamp_probs(np.stack([p_home, p_draw, p_away], axis=-1))


atk = RNG.normal(0, 0.35, N_TEAMS)
dfn = RNG.normal(0, 0.35, N_TEAMS)
MU, HOME_ADV = 0.20, 0.25

home_t = RNG.integers(0, N_TEAMS, N_MATCHES)
away_t = RNG.integers(0, N_TEAMS, N_MATCHES)
clash = home_t == away_t
while clash.any():
    away_t[clash] = RNG.integers(0, N_TEAMS, clash.sum())
    clash = home_t == away_t

lam_h = np.exp(MU + HOME_ADV + atk[home_t] - dfn[away_t])
lam_a = np.exp(MU + atk[away_t] - dfn[home_t])
true_p = oneXtwo(lam_h, lam_a)

u = RNG.random(N_MATCHES)
outcomes = (u[:, None] > np.cumsum(true_p, axis=1)).sum(axis=1)   # 0/1/2

# ----------------------------------------------------------------------------
# 2. FORECASTERS — heterogeneous skill, plus systematic bias / overconfidence
# ----------------------------------------------------------------------------
kinds = RNG.choice(["sharp", "decent", "noisy", "overconf", "biased"],
                   size=N_FORECASTERS, p=[0.08, 0.27, 0.35, 0.17, 0.13])
skill = np.empty(N_FORECASTERS)
bias = np.zeros(N_FORECASTERS)
temp = np.ones(N_FORECASTERS)            # <1 sharpen (overconfident), >1 flatten
for i, kd in enumerate(kinds):
    if kd == "sharp":     skill[i] = RNG.uniform(0.75, 0.95)
    elif kd == "decent":  skill[i] = RNG.uniform(0.40, 0.75)
    elif kd == "noisy":   skill[i] = RNG.uniform(0.05, 0.40)
    elif kd == "overconf":skill[i] = RNG.uniform(0.45, 0.72); temp[i] = RNG.uniform(0.35, 0.60)
    elif kd == "biased":  skill[i] = RNG.uniform(0.40, 0.70); bias[i] = RNG.uniform(0.25, 0.55)


def forecast_of(skill_i: float, bias_i: float, temp_i: float) -> np.ndarray:
    """A coherent but noisy private read of the truth (independent per forecaster)."""
    sd = 1.00 * (1.0 - skill_i)
    lh = lam_h * np.exp(RNG.normal(0, sd, N_MATCHES) + bias_i)
    la = lam_a * np.exp(RNG.normal(0, sd, N_MATCHES))
    p = oneXtwo(lh, la)
    if temp_i != 1.0:
        p = p ** (1.0 / temp_i)
        p = p / p.sum(axis=1, keepdims=True)
    return E.clamp_probs(p)


forecasts = np.stack([forecast_of(skill[i], bias[i], temp[i]) for i in range(N_FORECASTERS)])
market = forecast_of(0.88, 0.0, 1.0)     # a sharp 'closing line' baseline

# ----------------------------------------------------------------------------
# 3. WEIGHTS — fit on train window only
# ----------------------------------------------------------------------------
tr, te = slice(0, TRAIN), slice(TRAIN, N_MATCHES)
M_te = N_MATCHES - TRAIN

clim_tr = E.climatology(outcomes[tr], K)
ref_rps_tr = E.rps(np.tile(clim_tr, (TRAIN, 1)), outcomes[tr]).mean()
ref_rps_te = E.rps(np.tile(clim_tr, (M_te, 1)), outcomes[te]).mean()

rps_tr = np.array([E.rps(forecasts[i, tr], outcomes[tr]).mean() for i in range(N_FORECASTERS)])
n_obs = np.full(N_FORECASTERS, float(TRAIN))
w = E.calibration_weights(rps_tr, ref_rps_tr, n_obs, gamma=2.0, k=25.0)

best_i = int(np.argmin(rps_tr))                       # picked on TRAIN, judged on TEST
med_i = int(np.argsort(rps_tr)[N_FORECASTERS // 2])   # a typical individual

# ----------------------------------------------------------------------------
# 4. EVALUATE METHODS (out-of-sample)
# ----------------------------------------------------------------------------
ones = np.ones(N_FORECASTERS)

methods = {
    "Crowd · log-pool (calibration-weighted)": E.log_opinion_pool(forecasts[:, te], w),
    "Crowd · log-pool (equal weight)":         E.log_opinion_pool(forecasts[:, te], ones),
    "Crowd · linear pool (equal weight)":      E.linear_pool(forecasts[:, te], ones),
    "Sharp 'market' baseline":                 market[te],
    "Best individual (chosen on train)":       forecasts[best_i, te],
    "Median individual (typical)":             forecasts[med_i, te],
    "Climatology (base rates)":                np.tile(clim_tr, (M_te, 1)),
}

print("=" * 74)
print(f"OUT-OF-SAMPLE RESULTS  ({M_te} test matches, weights fit on {TRAIN})")
print("=" * 74)
print(f"{'method':<44}{'RPS':>8}{'logloss':>9}{'skill%':>9}")
print("-" * 74)
results = {}
for name, fc in methods.items():
    r = E.rps(fc, outcomes[te]).mean()
    ll = E.log_loss(fc, outcomes[te]).mean()
    sk = E.skill_score(r, ref_rps_te) * 100
    results[name] = (r, ll, sk)
    print(f"{name:<44}{r:>8.4f}{ll:>9.4f}{sk:>8.1f}%")
print("-" * 74)
oracle = results["Crowd · log-pool (calibration-weighted)"][0]
mkt = results["Sharp 'market' baseline"][0]
print(f"Oracle vs sharp market:  {(1-oracle/mkt)*100:+.1f}% RPS  (positive = oracle better)")

# weight sanity: how is weight distributed across kinds?
print("\nWeight share captured by forecaster type:")
for kd in ["sharp", "decent", "noisy", "overconf", "biased"]:
    share = w[kinds == kd].sum() / w.sum() * 100
    print(f"  {kd:<9} n={int((kinds==kd).sum()):<3}  weight share {share:5.1f}%")

# ----------------------------------------------------------------------------
# 5. H1 — skill recovery vs number of matches
# ----------------------------------------------------------------------------
ns = [20, 40, 80, 160, 320, 640, 1000, 1500]
rho = []
for n in ns:
    measured = np.array([E.rps(forecasts[i, :n], outcomes[:n]).mean() for i in range(N_FORECASTERS)])
    rho.append(spearmanr(-measured, skill).correlation)   # -RPS so higher=better

# ----------------------------------------------------------------------------
# 6. H3 — sybil robustness
# ----------------------------------------------------------------------------
# sybils = a COORDINATED manipulation: confidently push one outcome (Away) on
# every match. Uniform-random sybils are harmless to a log-pool; confident,
# coordinated ones are the real threat — and exactly what a track record filters.
target = np.array([0.07, 0.10, 0.83])
sybils = E.clamp_probs(RNG.dirichlet(target * 30.0, size=(MAX_SYBILS, N_MATCHES)))
syb_rps_tr = np.array([E.rps(sybils[j, tr], outcomes[tr]).mean() for j in range(MAX_SYBILS)])
syb_w = E.calibration_weights(syb_rps_tr, ref_rps_tr, np.full(MAX_SYBILS, float(TRAIN)),
                              gamma=2.0, k=25.0)

s_counts = [0, 50, 100, 200, 400, 800, 1500, 2000]
rps_weighted, rps_equal = [], []
for s in s_counts:
    all_fc = np.concatenate([forecasts[:, te], sybils[:s, te]], axis=0) if s else forecasts[:, te]
    all_w = np.concatenate([w, syb_w[:s]]) if s else w
    all_eq = np.ones(N_FORECASTERS + s)
    rps_weighted.append(E.rps(E.log_opinion_pool(all_fc, all_w), outcomes[te]).mean())
    rps_equal.append(E.rps(E.log_opinion_pool(all_fc, all_eq), outcomes[te]).mean())

print("\nSybil stress (RPS of the aggregate as coordinated sybils flood in):")
print(f"  {'#sybils':>8}{'equal-weight':>14}{'calib-weighted':>16}")
for s, re_, rw_ in zip(s_counts, rps_equal, rps_weighted):
    print(f"  {s:>8}{re_:>14.4f}{rw_:>16.4f}")
print(f"  -> real crowd keeps {w.sum()/(w.sum()+syb_w.sum())*100:.1f}% of weight even with "
      f"{MAX_SYBILS} sybils present")

# ----------------------------------------------------------------------------
# 7. FIGURE
# ----------------------------------------------------------------------------
plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
fig, ax = plt.subplots(2, 2, figsize=(13, 9.5))
C = {"oracle": "#1D9E75", "mkt": "#185FA5", "bad": "#D85A30", "grey": "#888780", "eq": "#D4537E"}

# Panel A — mean RPS by method
axA = ax[0, 0]
names = list(results.keys())
vals = [results[n][0] for n in names]
short = ["Crowd\n(weighted)", "Crowd\n(equal)", "Crowd\n(linear)", "Sharp\nmarket",
         "Best\nindividual", "Median\nindividual", "Climatology"]
cols = [C["oracle"], C["grey"], C["grey"], C["mkt"], C["grey"], C["bad"], C["bad"]]
bars = axA.bar(short, vals, color=cols, width=0.66)
axA.set_ylabel("Mean RPS  (lower = better)")
axA.set_title("A · Forecast accuracy, out-of-sample", fontweight="bold", loc="left")
axA.set_ylim(min(vals) * 0.97, max(vals) * 1.03)
for b, v in zip(bars, vals):
    axA.text(b.get_x() + b.get_width() / 2, v, f"{v:.4f}", ha="center", va="bottom", fontsize=8.5)

# Panel B — skill recovery
axB = ax[0, 1]
axB.plot(ns, rho, "-o", color=C["oracle"], lw=2)
axB.set_xscale("log")
axB.set_xlabel("matches scored (log scale)")
axB.set_ylabel("Spearman ρ  (measured skill vs true)")
axB.set_title("B · Luck washes out — ranking recovers true skill", fontweight="bold", loc="left")
axB.set_ylim(0, 1)
axB.axhline(1.0, color=C["grey"], ls=":", lw=1)
for x, y in zip(ns, rho):
    axB.annotate(f"{y:.2f}", (x, y), textcoords="offset points", xytext=(0, 8), fontsize=8, ha="center")

# Panel C — reliability of weighted crowd vs a median individual
axC = ax[1, 0]
med_i = int(np.argsort(rps_tr)[N_FORECASTERS // 2])
for fc, lab, c in [(E.log_opinion_pool(forecasts[:, te], w), "Crowd (weighted)", C["oracle"]),
                   (forecasts[med_i, te], "Median individual", C["bad"])]:
    pr, ob, cn = E.reliability(fc, outcomes[te], K, bins=10)
    m = cn > 0
    axC.plot(pr[m], ob[m], "-o", color=c, label=lab, lw=2, ms=5)
axC.plot([0, 1], [0, 1], ls=":", color=C["grey"], label="perfect calibration")
axC.set_xlabel("forecast probability")
axC.set_ylabel("observed frequency")
axC.set_title("C · Calibration (closer to diagonal = better)", fontweight="bold", loc="left")
axC.legend(frameon=False, fontsize=8.5, loc="upper left")

# Panel D — sybil robustness
axD = ax[1, 1]
axD.plot(s_counts, rps_equal, "-o", color=C["eq"], lw=2, label="equal weight (no defence)")
axD.plot(s_counts, rps_weighted, "-o", color=C["oracle"], lw=2, label="calibration-weighted")
axD.set_xlabel("number of sybil accounts injected")
axD.set_ylabel("aggregate RPS  (lower = better)")
axD.set_title("D · Sybil resistance by construction", fontweight="bold", loc="left")
axD.legend(frameon=False, fontsize=8.5, loc="upper left")

fig.suptitle("Proof of Foresight — mechanism validation", fontsize=14, fontweight="bold", y=0.995)
fig.tight_layout(rect=[0, 0, 1, 0.98])
fig.savefig("/home/claude/validation.png", dpi=140, bbox_inches="tight")
print("\nSaved figure -> validation.png")
