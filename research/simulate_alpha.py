"""
Proof of Foresight — market-relative alpha & reputation-laundering experiment.

The market is sharp on PUBLIC info but blind to PRIVATE signals informed
forecasters partially observe. We compare three OUT-OF-SAMPLE oracle weightings:

  W1  absolute RPS-skill          -> launderable: copy the line to build weight
  W2  market-relative alpha (ΔRPS)-> copying earns ~0 weight; crowd beats market
  W3  alpha x tight-cluster cap   -> also caps coordinated redundant cliques

Attack = sleeper laundering: a malicious account MIRRORS the closing line on the
training window (top absolute scores -> high W1 weight), then DEFECTS on the
test window with a coordinated biased forecast. Under W1 it has earned weight
and corrupts the oracle; under W2/W3 copying earned nothing, so defection is inert.

Run:  python simulate_alpha.py    (writes alpha_validation.png to $OUT_DIR or .)
"""
from __future__ import annotations
import os, math
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import engine as E

OUT = os.environ.get("OUT_DIR", ".")
RNG = np.random.default_rng(11)
K = 3
N_TEAMS, N_MATCHES, TRAIN = 40, 1600, 1100
FACT = np.array([math.factorial(k) for k in range(11)], dtype=float)


def poisson_pmf(lam, kmax=11):
    ks = np.arange(kmax)
    return np.exp(-lam[..., None]) * lam[..., None] ** ks / FACT[:kmax]


def oneXtwo(lh, la):
    ph, pa = poisson_pmf(lh), poisson_pmf(la)
    cdf_a = np.cumsum(pa, axis=-1)
    a_less = np.concatenate([np.zeros_like(cdf_a[..., :1]), cdf_a[..., :-1]], axis=-1)
    p_home = np.sum(ph * a_less, axis=-1)
    p_draw = np.sum(ph * pa, axis=-1)
    return E.clamp_probs(np.stack([p_home, p_draw, 1 - p_home - p_draw], axis=-1))


# TRUE WORLD = PUBLIC strength + PRIVATE strength (market sees only PUBLIC)
atk_pub, dfn_pub = RNG.normal(0, 0.35, N_TEAMS), RNG.normal(0, 0.35, N_TEAMS)
atk_prv, dfn_prv = RNG.normal(0, 0.22, N_TEAMS), RNG.normal(0, 0.22, N_TEAMS)
MU, HOME = 0.20, 0.25

ht = RNG.integers(0, N_TEAMS, N_MATCHES)
at = RNG.integers(0, N_TEAMS, N_MATCHES)
bad = ht == at
while bad.any():
    at[bad] = RNG.integers(0, N_TEAMS, bad.sum()); bad = ht == at

base_pub_h = MU + HOME + atk_pub[ht] - dfn_pub[at]
base_pub_a = MU + atk_pub[at] - dfn_pub[ht]
priv_h = atk_prv[ht] - dfn_prv[at]
priv_a = atk_prv[at] - dfn_prv[ht]

true_p = oneXtwo(np.exp(base_pub_h + priv_h), np.exp(base_pub_a + priv_a))
u = RNG.random(N_MATCHES)
outcomes = (u[:, None] > np.cumsum(true_p, axis=1)).sum(axis=1)

market = oneXtwo(np.exp(base_pub_h + RNG.normal(0, 0.05, N_MATCHES)),
                 np.exp(base_pub_a + RNG.normal(0, 0.05, N_MATCHES)))

tr, te = slice(0, TRAIN), slice(TRAIN, N_MATCHES)
M_te = N_MATCHES - TRAIN
mkt_rps_tr = E.rps(market[tr], outcomes[tr])
mkt_rps_te = E.rps(market[te], outcomes[te]).mean()
clim_tr = E.climatology(outcomes[tr], K)
ref_rps_tr = E.rps(np.tile(clim_tr, (TRAIN, 1)), outcomes[tr]).mean()


def informed(nu):
    return oneXtwo(np.exp(base_pub_h + priv_h + RNG.normal(0, nu, N_MATCHES)),
                   np.exp(base_pub_a + priv_a + RNG.normal(0, nu, N_MATCHES)))

def copy_line():
    return oneXtwo(np.exp(base_pub_h + RNG.normal(0, 0.04, N_MATCHES)),
                   np.exp(base_pub_a + RNG.normal(0, 0.04, N_MATCHES)))

def noisy():
    return oneXtwo(np.exp(base_pub_h + RNG.normal(0, 0.7, N_MATCHES)),
                   np.exp(base_pub_a + RNG.normal(0, 0.7, N_MATCHES)))

def overconfident():
    f = informed(0.3) ** (1 / 0.5)
    return E.clamp_probs(f / f.sum(1, keepdims=True))

def launderer():
    """Sleeper attack: copy the line on train (build absolute reputation),
    then defect on test with a coordinated bias (confidently push Away)."""
    f = copy_line()
    f[te] = oneXtwo(np.exp(base_pub_h[te] - 1.3), np.exp(base_pub_a[te] + 1.3))
    return f

# redundant clique: one shared private read + tiny noise -> alpha but ~1 source
shared_h = priv_h + RNG.normal(0, 0.18, N_MATCHES)
shared_a = priv_a + RNG.normal(0, 0.18, N_MATCHES)
def clique_member():
    return oneXtwo(np.exp(base_pub_h + shared_h + RNG.normal(0, 0.03, N_MATCHES)),
                   np.exp(base_pub_a + shared_a + RNG.normal(0, 0.03, N_MATCHES)))

N_INF, N_NOISE, N_OVER, N_CLIQUE = 110, 70, 40, 40
fc_list, kind = [], []
for _ in range(N_INF):    fc_list.append(informed(RNG.uniform(0.22, 0.38))); kind.append("informed")
for _ in range(N_NOISE):  fc_list.append(noisy());         kind.append("noisy")
for _ in range(N_OVER):   fc_list.append(overconfident()); kind.append("overconf")
for _ in range(N_CLIQUE): fc_list.append(clique_member()); kind.append("clique")
base_fc = np.stack(fc_list); kind = np.array(kind); N_BASE = base_fc.shape[0]
LAUND_POOL = 600
launderers = np.stack([launderer() for _ in range(LAUND_POOL)])


def per_match_rps(fc):
    return np.stack([E.rps(fc[i, tr], outcomes[tr]) for i in range(fc.shape[0])])

def build_weights(fc):
    rps_pm = per_match_rps(fc); mean_rps = rps_pm.mean(1)
    n = np.full(fc.shape[0], float(TRAIN))
    w1 = E.calibration_weights(mean_rps, ref_rps_tr, n, gamma=2.0, k=25.0)
    alpha = np.array([E.market_relative_alpha(rps_pm[i], mkt_rps_tr) for i in range(fc.shape[0])])
    w2 = E.alpha_weights(alpha, n, gamma=2.0, k=25.0)
    resid = (fc[:, tr] - market[tr]).reshape(fc.shape[0], -1)
    w3 = E.tight_cluster_cap(resid, w2, sim_threshold=0.92)
    return w1, w2, w3, mean_rps, alpha

def oracle_eval(fc, w):
    o = E.log_opinion_pool(fc[:, te], w); r = E.rps(o, outcomes[te]).mean()
    return mkt_rps_te - r, r

FULL_L = 250
full_fc = np.concatenate([base_fc, launderers[:FULL_L]], axis=0)
full_kind = np.concatenate([kind, np.array(["launderer"] * FULL_L)])
w1, w2, w3, mean_rps, alpha = build_weights(full_fc)

print("=" * 78)
print(f"MARKET-RELATIVE ALPHA + ANTI-LAUNDERING  (test={M_te}, market RPS={mkt_rps_te:.4f})")
print("=" * 78)
print(f"{'oracle weighting':<32}{'RPS':>9}{'alpha vs market':>18}")
print("-" * 78)
for name, w in [("equal weight", np.ones(full_fc.shape[0])), ("W1 absolute-RPS", w1),
                ("W2 alpha", w2), ("W3 alpha x decorrelation", w3)]:
    a, r = oracle_eval(full_fc, w)
    print(f"{name:<32}{r:>9.4f}{a:>+17.4f}")
best_inf = np.where(full_kind == "informed")[0][np.argmin(mean_rps[full_kind == "informed"])]
br = E.rps(full_fc[best_inf, te], outcomes[te]).mean()
print(f"{'best informed individual':<32}{br:>9.4f}{mkt_rps_te-br:>+17.4f}")
print("-" * 78)

print("\nWeight share by type:")
print(f"  {'type':<11}{'n':>5}{'W1':>9}{'W2':>9}{'W3':>9}")
for t in ["informed", "clique", "noisy", "overconf", "launderer"]:
    m = full_kind == t
    print(f"  {t:<11}{int(m.sum()):>5}{w1[m].sum()/w1.sum()*100:>8.1f}%"
          f"{w2[m].sum()/w2.sum()*100:>8.1f}%{w3[m].sum()/w3.sum()*100:>8.1f}%")

fracs = [0, 50, 100, 200, 350, 500, 600]
sw1, sw2, sw3 = [], [], []
for s in fracs:
    fc = np.concatenate([base_fc, launderers[:s]], axis=0) if s else base_fc
    a1, a2, a3, _, _ = build_weights(fc)
    sw1.append(oracle_eval(fc, a1)[0]); sw2.append(oracle_eval(fc, a2)[0]); sw3.append(oracle_eval(fc, a3)[0])
copier_pct = [s / (N_BASE + s) * 100 for s in fracs]
print("\nSweep — oracle alpha vs market as launder-then-defect accounts flood in:")
print(f"  {'%accts':>8}{'W1':>10}{'W2':>10}{'W3':>10}")
for p, a1, a2, a3 in zip(copier_pct, sw1, sw2, sw3):
    print(f"  {p:>7.0f}%{a1:>+10.4f}{a2:>+10.4f}{a3:>+10.4f}")

# FIGURE
plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
fig, ax = plt.subplots(2, 2, figsize=(13, 9.5))
C = {"a": "#1D9E75", "m": "#185FA5", "bad": "#D85A30", "g": "#888780", "eq": "#D4537E", "cl": "#BA7517"}

axA = ax[0, 0]
axA.axhline(0, color=C["g"], ls=":", lw=1)
axA.plot(copier_pct, sw1, "-o", color=C["bad"], lw=2, label="W1 absolute-RPS")
axA.plot(copier_pct, sw2, "-o", color=C["a"], lw=2, label="W2 alpha")
axA.plot(copier_pct, sw3, "-s", color=C["m"], lw=2, ms=5, label="W3 alpha + decorrelation")
axA.set_xlabel("% of crowd that is launder-then-defect")
axA.set_ylabel("oracle alpha vs market\n(>0 beats line, <0 corrupted)")
axA.set_title("A · Sleeper laundering vs the fix", fontweight="bold", loc="left")
axA.legend(frameon=False, fontsize=8.5, loc="lower left")

axB = ax[0, 1]
abs_skill = 1 - mean_rps / ref_rps_tr
for t, c, mk in [("informed", C["a"], "o"), ("launderer", C["bad"], "x"),
                 ("clique", C["cl"], "^"), ("noisy", C["g"], "."), ("overconf", C["eq"], "+")]:
    m = full_kind == t
    axB.scatter(abs_skill[m], alpha[m], s=22, c=c, marker=mk, label=t, alpha=0.8)
axB.axhline(0, color=C["g"], ls=":", lw=1)
axB.set_xlabel("absolute skill on train (1 - RPS/climatology)")
axB.set_ylabel("market-relative alpha (ΔRPS)")
axB.set_title("B · High train rank ≠ oracle value", fontweight="bold", loc="left")
axB.legend(frameon=False, fontsize=8, loc="lower right")

axC = ax[1, 0]
types = ["informed", "clique", "noisy", "overconf", "launderer"]
s1 = [w1[full_kind == t].sum() / w1.sum() * 100 for t in types]
s2 = [w2[full_kind == t].sum() / w2.sum() * 100 for t in types]
s3 = [w3[full_kind == t].sum() / w3.sum() * 100 for t in types]
x = np.arange(len(types)); wd = 0.27
axC.bar(x - wd, s1, wd, color=C["bad"], label="W1 absolute")
axC.bar(x, s2, wd, color=C["a"], label="W2 alpha")
axC.bar(x + wd, s3, wd, color=C["m"], label="W3 +decorr")
axC.set_xticks(x); axC.set_xticklabels(types, fontsize=8.5)
axC.set_ylabel("share of oracle weight (%)")
axC.set_title("C · Who controls the oracle", fontweight="bold", loc="left")
axC.legend(frameon=False, fontsize=8)

axD = ax[1, 1]
names = ["market", "W1\noracle", "W2\noracle", "W3\noracle", "best\ninformed"]
vals = [mkt_rps_te, oracle_eval(full_fc, w1)[1], oracle_eval(full_fc, w2)[1],
        oracle_eval(full_fc, w3)[1], br]
cols = [C["m"], C["bad"], C["a"], C["m"], C["g"]]
bars = axD.bar(names, vals, color=cols, width=0.66)
axD.axhline(mkt_rps_te, color=C["m"], ls=":", lw=1)
axD.set_ylabel("test RPS (lower = better)")
axD.set_title("D · Does the crowd beat the market? (with 25% launderers)", fontweight="bold", loc="left", fontsize=10.5)
axD.set_ylim(min(vals) * 0.98, max(vals) * 1.02)
for b, v in zip(bars, vals):
    axD.text(b.get_x()+b.get_width()/2, v, f"{v:.4f}", ha="center", va="bottom", fontsize=8)

fig.suptitle("Proof of Foresight — market-relative alpha & anti-laundering",
             fontsize=14, fontweight="bold", y=0.995)
fig.tight_layout(rect=[0, 0, 1, 0.98])
path = os.path.join(OUT, "alpha_validation.png")
fig.savefig(path, dpi=140, bbox_inches="tight")
print(f"\nSaved figure -> {path}")
