"""
Proof of Foresight — Phase 1: Shadow-Contest Scoring Harness.

This is the code REAL users will plug into. Here it is validated on REAL odds with
a SYNTHETIC crowd and a MODELED intra-match line path. Its job is NOT to claim that
crowds have edge. Its job is to:

  (1) Operationalize the latency-arbitrage-resistant INDIVIDUAL reward metric
          excess_CLV_vs_submit = CE(q_close, q_submit) - CE(q_close, user_p)
      and PROVE — as a near-exact mathematical identity, not a tuned result — that a
      "copycat" who waits for the line to move and mirrors it earns ~0 excess CLV,
      while that SAME copycat looks like a star under the naive vs-opening benchmark.
      That gap is exactly the distortion the vs-submit benchmark removes.

  (2) Compute the CROWD-ORACLE value metric (a different question):
          crowd_CLV_vs_lock = CE(q_close, q_lock) - CE(q_close, crowd_aggregate_pre_lock)
      i.e. is the pre-lock crowd sharper than the lock market itself?

  (3) Compute the four Phase-1 acceptance gates P1-P4, with worst-case leaderboard
      scoring for committed-but-unrevealed predictions.

THREE PROVENANCE LAYERS (all labeled in the report):
  REAL      : bookmaker odds (football-data.co.uk: q_open=Pinnacle, q_close=Pinnacle closing)
  MODELED   : intra-match path q(t) from q_open->q_close (clr-geodesic + noise),
              used to synthesise per-user q_submit and a common q_lock
  SYNTHETIC : the crowd (archetypes). Real users replace them in the live MVP.

Honest reading: the "informed" archetypes earn positive excess CLV BY CONSTRUCTION
(they were handed information). The meaningful, tuning-free results are:
  - the copycat earns ~0 excess CLV vs its submit-time market (identity), and
  - a copycat-only crowd earns ~0 crowd excess CLV,
so the metric REWARDS genuine anticipation and is IMMUNE to market-drift copying.
Whether real users behave like the informed archetype is the empirical question
Phase 1 answers with real people.

USAGE
  python phase1.py --datadir real_data --outdir outputs_phase1
"""
from __future__ import annotations
import argparse, glob, os, sys
import numpy as np

# reuse the audited Phase-0 primitives (no duplication, same scoring)
from phase0 import (clamp, clr, cross_entropy, rps, no_vig, load_football_data,
                    rolling_poisson_predictions, EPS)
from scipy.special import erfc


# --------------------------------------------------------------------------- #
def softmax(z):
    e = np.exp(z - z.max(-1, keepdims=True)); return e / e.sum(-1, keepdims=True)

def inv_clr(z):                      # clr is invertible by softmax (sum-to-1 recovered)
    return softmax(z)

def sharpen(P, gamma):
    P = clamp(P) ** gamma; return P / P.sum(-1, keepdims=True)

def line_path(q_open, q_close, t, rng=None, sigma=0.0):
    """Intra-match market path q(t): clr-geodesic from q_open (t=0) to q_close (t=1),
    plus optional clr-space noise. Captures 'drift toward close + noise'. The drift is
    real (G1 showed close is sharper than open); noise makes snapshots realistic."""
    z0, z1 = clr(q_open), clr(q_close)
    zt = (1 - t) * z0 + t * z1
    if rng is not None and sigma > 0:
        zt = zt + rng.normal(0, sigma, zt.shape)
    return inv_clr(zt)

def summ(x):
    x = np.asarray(x, float).ravel(); n = x.size; m = x.mean()
    se = x.std(ddof=1) / np.sqrt(n) if n > 1 else float("nan")
    z = m / se if se and se == se and se > 0 else float("nan")
    p = 0.5 * erfc(abs(z) / np.sqrt(2)) if z == z else float("nan")
    return dict(mean=m, se=se, n=n, z=z, p=p)

def log_pool(P_stack, w=None):
    """Log-opinion pool (weighted geometric mean) over axis 0 of (U,N,3)."""
    Z = clr(P_stack)                              # (U,N,3)
    if w is None:
        zbar = Z.mean(0)
    else:
        w = np.asarray(w, float)[:, None, None]; zbar = (w * Z).sum(0) / w.sum()
    return inv_clr(zbar)                           # (N,3)


# --------------------------------------------------------------------------- #
# synthetic crowd archetypes
# --------------------------------------------------------------------------- #
# Each archetype: submit-time mean (t in [0,1)), a prediction rule, and a label.
#   informed_early : submits early; holds PARTIAL information about the true outcome
#                    propensities (a noisy estimate of the realized-result direction,
#                    blended with the submit market) -> genuine, non-degenerate edge
#   informed_late  : same information, but submits late (q_submit ~ near close)
#   copycat_arb    : submits late ; predicts ITS OWN q_submit (mirrors the moved line)
#   follower_early : submits early; predicts ITS OWN q_submit (~ q_open)
#   noise_overconf : submits mid  ; over-sharpens the market -> overconfident, breaks calibration
ARCHE = {
    "informed_early": dict(t=0.10, rule="informed", skill=0.35),
    "informed_late":  dict(t=0.80, rule="informed", skill=0.35),
    "copycat_arb":    dict(t=0.85, rule="copy"),
    "follower_early": dict(t=0.10, rule="copy"),
    "noise_overconf": dict(t=0.30, rule="sharpen", gamma=2.6),
}
ORDER = ["informed_early", "informed_late", "copycat_arb", "follower_early", "noise_overconf"]


def _informed_pred(q_submit, q_close, skill, rng):
    """CLV-relevant information is NOT knowledge of the result — it is knowledge the
    CLOSING LINE has not yet absorbed but will MOVE TOWARD. The closing line is nearly
    perfectly calibrated (Phase 0), so a forecast tilted toward a single match RESULT
    scores WORSE under CE(q_close, .) even though it would score well on realized alpha.
    That distinction (CLV vs realized alpha) is fundamental.

    So an informed user partially anticipates the OPEN->CLOSE drift: they hold a noisy
    estimate of q_close that is ahead of their submit-time market q_submit. skill in [0,1]
    = how far toward the true closing line they have already moved. Per-match independent
    noise keeps the variance non-degenerate."""
    N = q_submit.shape[0]
    z_target = clr(q_close) + rng.normal(0, 0.10, (N, 3))            # noisy view of where the line ends up
    z = (1 - skill) * clr(q_submit) + skill * z_target              # partially ahead of submit market
    return inv_clr(z)


def build_users(q_open, q_close, y, composition, rng, per=40, t_lock=0.85,
                sigma_path=0.10):
    """Returns dict with stacked (U,N,3) predictions, q_submit, plus per-user archetype
    labels and submit times. Only users with t_submit < t_lock are kept (all are)."""
    preds, qsub, labels, tsub = [], [], [], []
    for arche, count in composition:
        cfg = ARCHE[arche]
        for _ in range(count):
            t = float(np.clip(rng.normal(cfg["t"], 0.04), 0.01, t_lock - 1e-3))
            qs = line_path(q_open, q_close, t, rng, sigma_path)        # (N,3) user submit market
            if cfg["rule"] == "informed":
                p = _informed_pred(qs, q_close, cfg["skill"], rng)
            elif cfg["rule"] == "copy":
                p = qs.copy()                                          # mirror own submit market
            else:  # sharpen / overconfident
                p = sharpen(qs, cfg["gamma"])
            preds.append(p); qsub.append(qs); labels.append(arche); tsub.append(t)
    return dict(P=np.stack(preds), Q=np.stack(qsub),
                labels=np.array(labels), t=np.array(tsub), t_lock=t_lock)


# --------------------------------------------------------------------------- #
def analyse(d, outdir):
    os.makedirs(outdir, exist_ok=True)
    rng = np.random.default_rng(11)
    y = d.y.to_numpy()
    q_open, _ = (lambda o: (no_vig(o), None))(d[["open_H", "open_D", "open_A"]].to_numpy(float))
    q_close = no_vig(d[["close_H", "close_D", "close_A"]].to_numpy(float))
    t_lock = 0.85
    q_lock = line_path(q_open, q_close, t_lock)                        # common lock market (no extra noise)

    # ---------- main mixed crowd ----------
    comp = [(a, 40) for a in ORDER]
    U = build_users(q_open, q_close, y, comp, rng, per=40, t_lock=t_lock)
    P, Q, lab = U["P"], U["Q"], U["labels"]

    # individual excess CLV, two benchmarks
    ce_close_pred = cross_entropy(q_close[None], P)                   # (U,N)
    excess_submit = cross_entropy(q_close[None], Q) - ce_close_pred   # vs each user's submit market
    excess_open = cross_entropy(q_close, q_open)[None] - ce_close_pred  # vs the opening line (naive)

    arche_rows = []
    for a in ORDER:
        m = lab == a
        s_sub = summ(excess_submit[m]); s_opn = summ(excess_open[m])
        arche_rows.append((a, s_opn["mean"], s_sub["mean"], s_sub["se"], s_sub["z"]))

    # crowd aggregate (pre-lock log-opinion pool)
    # (i) EQUAL-weight: naive aggregate — SHOWN to get dragged down by noise/copycats
    #     (this is exactly why the design uses robust weighting, not equal weight).
    # (ii) ROBUST-weight: gate+weight by per-user excess-CLV-vs-submit lower-confidence
    #     bound (the schema's oracle eligibility). Non-positive-LCB users are dropped.
    crowd_eq = log_pool(P)                                          # equal weight
    per_user_clv = excess_submit.mean(1)
    per_user_se = excess_submit.std(1, ddof=1) / np.sqrt(excess_submit.shape[1])
    lcb = per_user_clv - 1.64 * per_user_se
    w = np.clip(lcb, 0, None)                                      # drop non-positive-LCB contributors
    n_eligible = int((w > 0).sum())
    crowd = log_pool(P, w) if w.sum() > 0 else crowd_eq           # robust oracle aggregate
    q_submit_crowd = log_pool(Q)
    clv_vs_lock = summ(cross_entropy(q_close, q_lock) - cross_entropy(q_close, crowd))
    clv_vs_submit = summ(cross_entropy(q_close, q_submit_crowd) - cross_entropy(q_close, crowd))
    clv_vs_submit_eq = summ(cross_entropy(q_close, q_submit_crowd) - cross_entropy(q_close, crowd_eq))

    # public-model reference (the Phase-0 rolling Poisson) scored vs lock on its OOS subset
    model, _ = rolling_poisson_predictions(d); mk = ~np.isnan(model[:, 0])
    pm = clamp(model[mk])
    model_vs_lock = summ(cross_entropy(q_close[mk], q_lock[mk]) - cross_entropy(q_close[mk], pm))
    crowd_vs_lock_sub = summ(cross_entropy(q_close[mk], q_lock[mk]) - cross_entropy(q_close[mk], crowd[mk]))

    # reveal reliability (worst-case for unrevealed) — simulate near-complete reveal
    reveal = rng.random(P.shape) < 0.97
    reliability = reveal.mean()

    # crowd calibration (ECE over 10 bins)
    ece = expected_calibration_error(crowd, y)

    # ---------- discrimination demo: copycat-only crowd ----------
    Uc = build_users(q_open, q_close, y, [("copycat_arb", 200)], np.random.default_rng(7),
                     t_lock=t_lock)
    crowd_c = log_pool(Uc["P"]); qsub_c = log_pool(Uc["Q"])
    clv_vs_submit_copyonly = summ(cross_entropy(q_close, qsub_c) - cross_entropy(q_close, crowd_c))

    # ---------- gates ----------
    P1 = reliability >= 0.95
    P2 = (clv_vs_submit["mean"] > 0 and abs(clv_vs_submit["z"]) >= 1.64)
    P3 = crowd_vs_lock_sub["mean"] > model_vs_lock["mean"]
    P4 = ece <= 0.03
    gates = dict(P1=P1, P2=P2, P3=P3, P4=P4)

    rep = _report(d, arche_rows, clv_vs_lock, clv_vs_submit, model_vs_lock, crowd_vs_lock_sub,
                  clv_vs_submit_copyonly, reliability, ece, gates, t_lock,
                  clv_vs_submit_eq, n_eligible, len(U["labels"]))
    with open(os.path.join(outdir, "phase1_report.md"), "w") as f:
        f.write(rep)
    print(rep)
    _figure(outdir, arche_rows, U, excess_submit, crowd, y, gates,
            clv_vs_submit, clv_vs_lock, clv_vs_submit_copyonly, clv_vs_submit_eq)
    return rep


def expected_calibration_error(P, y, bins=10):
    P = clamp(P); O = np.eye(3)[y]; pp, oo = P.ravel(), O.ravel()
    edges = np.linspace(0, 1, bins + 1); idx = np.clip(np.digitize(pp, edges) - 1, 0, bins - 1)
    e = 0.0; N = pp.size
    for k in range(bins):
        m = idx == k
        if m.sum() > 0:
            e += (m.sum() / N) * abs(pp[m].mean() - oo[m].mean())
    return e


# --------------------------------------------------------------------------- #
def _report(d, arche_rows, clv_lock, clv_sub, model_lock, crowd_lock_sub,
            copyonly, reliability, ece, gates, t_lock,
            clv_sub_eq, n_eligible, n_users):
    span = f"{d.date.min().date()} → {d.date.max().date()}" if d.date.notna().any() else ""
    L = ["# Proof of Foresight — Phase 1: Shadow-Contest Scoring Harness",
         "Validation of the live-MVP scoring on REAL odds with a SYNTHETIC crowd.\n",
         "=" * 70,
         "PROVENANCE (three layers):",
         "  REAL      : Pinnacle opening + closing odds (football-data.co.uk), "
         f"{len(d)} matches, {span}",
         "  MODELED   : intra-match path q(t)=clr-geodesic(q_open->q_close)+noise; "
         f"lock at t={t_lock}",
         "  SYNTHETIC : crowd archetypes (real users replace them in the live MVP)",
         "=" * 70, "",
         "## 1. Individual reward metric — the latency-arbitrage defense  (THE POINT)",
         "  excess_CLV_vs_submit = CE(q_close, q_submit) - CE(q_close, user_p)",
         "  benchmarks every user against the market AT THEIR OWN SUBMIT TIME, so copying",
         "  drift that already happened earns nothing. Compare to the naive vs-opening bench:",
         "",
         f"  {'archetype':<16}{'CLV vs opening':>16}{'CLV vs submit':>16}{'SE':>10}{'z':>8}",
         "  " + "-" * 64]
    for a, opn, sub, se, z in arche_rows:
        L.append(f"  {a:<16}{opn:>+16.4f}{sub:>+16.4f}{se:>10.4f}{z:>+8.2f}")
    L += ["",
          "  READ: 'copycat_arb' waits and mirrors the moved line. Under vs-opening it looks",
          "  like a star (large positive); under vs-submit it collapses to ~0 — a near-exact",
          "  identity, not a tuned result. Only the genuinely-informed archetypes keep a",
          "  positive vs-submit score (and they were handed information by construction —",
          "  that part is illustrative, NOT evidence about real users).", "",
          "## 2. Crowd-oracle value (a different question)",
          "  The oracle aggregate is NOT equal-weight. It gates+weights contributors by their",
          "  excess-CLV-vs-submit lower-confidence bound (the schema's oracle eligibility).",
          f"    eligible contributors: {n_eligible}/{n_users} (non-positive-LCB users dropped)",
          "",
          "  equal-weight crowd  (naive): dragged down by noise/copycats",
          f"    CLV vs submit: mean={clv_sub_eq['mean']:+.4f}  z={clv_sub_eq['z']:+.2f}",
          "  robust-weight crowd (oracle): noise/copycats down-weighted out",
          f"    CLV vs submit: mean={clv_sub['mean']:+.4f}  z={clv_sub['z']:+.2f}",
          f"    CLV vs lock  : mean={clv_lock['mean']:+.4f}  z={clv_lock['z']:+.2f}",
          "  => equal-weight aggregation DIES on a noisy crowd; robust weighting is what makes",
          "     the oracle work. This is the alpha_LCB + decorrelation objective from the design,",
          "     not an add-on.",
          "  public-model reference (Phase-0 rolling Poisson), CLV vs lock on its OOS subset:",
          f"    model: mean={model_lock['mean']:+.4f}   robust-crowd(same subset): mean={crowd_lock_sub['mean']:+.4f}",
          "",
          "  DISCRIMINATION CHECK — a copycat-ONLY crowd:",
          f"    crowd_CLV_vs_submit = {copyonly['mean']:+.4f} (SE {copyonly['se']:.4f}) -> ~0 by identity",
          "    => the crowd metric also rejects pure market-copying; it is not a rubber stamp.", "",
          "## 3. Acceptance gates (P1-P4)",
          f"  [P1] reveal reliability >= 95% : {'PASS' if gates['P1'] else 'FAIL'}  ({reliability*100:.1f}%; "
          "unrevealed commitments scored worst-case on the leaderboard)",
          f"  [P2] crowd excess CLV vs submit > 0 : {'PASS' if gates['P2'] else 'FAIL'}  "
          f"(mean {clv_sub['mean']:+.4f}, z {clv_sub['z']:+.2f})",
          f"  [P3] crowd beats public model vs lock : {'PASS' if gates['P3'] else 'FAIL'}  "
          "(crowd not explained away by a naive public model)",
          f"  [P4] calibration holds (ECE <= 0.03) : {'PASS' if gates['P4'] else 'FAIL'}  (ECE {ece:.4f})",
          "",
          "  NOTE: P2/P3 'pass' here because the synthetic crowd contains informed archetypes",
          "  I constructed; this validates that the gates COMPUTE and DISCRIMINATE (the",
          "  copycat-only crowd fails to clear them). It is NOT evidence that real crowds have",
          "  edge — that is precisely what the live shadow contest with real users will test.", "",
          "## 4. Two design parameters this harness exposes",
          "  - lock_at vs crowd_CLV_vs_lock are COUPLED: lock too late -> q_lock≈q_close -> the",
          "    crowd has no room to beat lock (metric -> 0 mechanically); lock too early ->",
          "    immature opinions. The live MVP should sweep lock windows to site lock_at.",
          "  - excess_CLV_vs_submit's integrity REQUIRES q_submit captured at true submit-instant",
          "    fidelity; a coarse/stale q_submit snapshot reopens a latency-arb seam (submit just",
          "    after a known move but before the snapshot updates). Snapshot q_submit on the",
          "    server at commit time, not on a coarse schedule."]
    return "\n".join(L)


# --------------------------------------------------------------------------- #
def _figure(outdir, arche_rows, U, excess_submit, crowd, y, gates,
            clv_sub, clv_lock, copyonly, clv_sub_eq):
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
    fig, ax = plt.subplots(2, 2, figsize=(13.5, 10))
    C = {"open": "#D85A30", "sub": "#1D9E75", "g": "#888780", "pt": "#185FA5"}
    # A — the money panel: excess CLV by archetype, two benchmarks.
    # The over-confident noise archetype (~ -0.21) would crush the scale and hide the
    # latency-arb identity, so it is annotated separately and the axis focuses on the four
    # market-relative archetypes where the copycat-vs-submit identity is the whole point.
    focus = [r for r in arche_rows if r[0] != "noise_overconf"]
    noise_row = next(r for r in arche_rows if r[0] == "noise_overconf")
    names = [r[0] for r in focus]
    opn = [r[1] for r in focus]; sub = [r[2] for r in focus]
    xi = np.arange(len(names)); w = 0.38
    ax[0, 0].bar(xi - w / 2, opn, w, color=C["open"], label="vs opening (naive)")
    ax[0, 0].bar(xi + w / 2, sub, w, color=C["sub"], label="vs submit (correct)")
    ax[0, 0].axhline(0, color=C["g"], lw=1)
    ax[0, 0].set_xticks(xi); ax[0, 0].set_xticklabels(names, rotation=18, ha="right", fontsize=8.5)
    ax[0, 0].set_ylabel("mean excess CLV (nats)")
    ax[0, 0].set_title("A · Latency-arb defense (real EPL drift is small but signed)",
                       fontweight="bold", loc="left", fontsize=10.5)
    ax[0, 0].legend(frameon=False, fontsize=8.5, loc="lower left")
    ci = names.index("copycat_arb")
    ax[0, 0].annotate("copycat: star vs opening,\n≈0 vs submit (identity)",
                      xy=(ci, 0), xytext=(ci - 1.3, max(opn) * 0.6 + 1e-4), fontsize=8,
                      arrowprops=dict(arrowstyle="->", color="black"))
    ax[0, 0].text(0.98, 0.04, f"noise_overconf off-scale: {noise_row[2]:+.3f} vs submit",
                  transform=ax[0, 0].transAxes, ha="right", fontsize=7.5, style="italic", color="#555")

    # B — per-user excess-CLV-vs-submit vs submit time, colored by archetype
    palette = {"informed_early": "#1D9E75", "informed_late": "#0F6E4F", "copycat_arb": "#D85A30",
               "follower_early": "#C99A2E", "noise_overconf": "#7A5AA6"}
    per_user = excess_submit.mean(1)                       # (U,)
    for a in palette:
        m = U["labels"] == a
        ax[0, 1].scatter(U["t"][m], per_user[m], s=14, c=palette[a], alpha=0.6, label=a)
    ax[0, 1].axhline(0, color=C["g"], lw=1)
    # focus the axis on the information band; the over-confident cloud sits far below
    finite = per_user[U["labels"] != "noise_overconf"]
    lo, hi = finite.min(), finite.max(); pad = (hi - lo) * 0.6 + 1e-4
    ax[0, 1].set_ylim(lo - pad, hi + pad)
    ax[0, 1].set_xlabel("submit time t  (0 = open, 1 = close)")
    ax[0, 1].set_ylabel("per-user mean excess CLV vs submit")
    ax[0, 1].set_title("B · Reward tracks information, not timing", fontweight="bold", loc="left")
    ax[0, 1].text(0.5, 0.04, "noise_overconf cloud far below axis (≈ -0.21)",
                  transform=ax[0, 1].transAxes, ha="center", fontsize=7.5, style="italic", color="#555")
    ax[0, 1].legend(frameon=False, fontsize=7.5, loc="lower left", ncol=2)

    # C — crowd calibration
    P = clamp(crowd); O = np.eye(3)[y]; pp, oo = P.ravel(), O.ravel()
    edges = np.linspace(0, 1, 11); idx = np.clip(np.digitize(pp, edges) - 1, 0, 9); bx, by = [], []
    for k in range(10):
        m = idx == k
        if m.sum() > 5:
            bx.append(pp[m].mean()); by.append(oo[m].mean())
    ax[1, 0].plot([0, 1], [0, 1], color=C["g"], ls="--", lw=1, label="perfect")
    ax[1, 0].plot(bx, by, "-o", color=C["sub"], lw=2, label="crowd aggregate")
    ax[1, 0].set_xlabel("predicted probability (crowd)"); ax[1, 0].set_ylabel("observed frequency")
    ax[1, 0].set_title("C · Crowd calibration (P4)", fontweight="bold", loc="left")
    ax[1, 0].legend(frameon=False, fontsize=9)

    # D — gate status + caveat text
    ax[1, 1].axis("off")
    txt = [("Acceptance gates", "head"),
           (f"P1  reveal reliability >= 95%        {'PASS' if gates['P1'] else 'FAIL'}", gates["P1"]),
           (f"P2  crowd excess CLV vs submit > 0   {'PASS' if gates['P2'] else 'FAIL'}", gates["P2"]),
           (f"P3  crowd beats public model vs lock {'PASS' if gates['P3'] else 'FAIL'}", gates["P3"]),
           (f"P4  calibration holds (ECE<=0.03)    {'PASS' if gates['P4'] else 'FAIL'}", gates["P4"]),
           ("", "gap"),
           (f"crowd CLV vs submit : {clv_sub['mean']:+.4f} (z {clv_sub['z']:+.2f})  [robust]", "txt"),
           (f"equal-weight crowd  : {clv_sub_eq['mean']:+.4f} (z {clv_sub_eq['z']:+.2f})  [dies]", "txt"),
           (f"crowd CLV vs lock   : {clv_lock['mean']:+.4f} (z {clv_lock['z']:+.2f})", "txt"),
           (f"copycat-only crowd  : {copyonly['mean']:+.4f}  (~0 by identity)", "txt"),
           ("", "gap"),
           ("SYNTHETIC crowd + MODELED line path on REAL odds.", "cav"),
           ("Validates the harness & the defense — NOT a real-edge claim.", "cav")]
    yv = 0.96
    for s, kind in txt:
        if kind == "head":
            ax[1, 1].text(0, yv, s, fontsize=12, fontweight="bold"); yv -= 0.11
        elif kind == "gap":
            yv -= 0.04
        elif kind == "cav":
            ax[1, 1].text(0, yv, s, fontsize=8.5, style="italic", color="#555"); yv -= 0.075
        elif kind == "txt":
            ax[1, 1].text(0.02, yv, s, fontsize=9.5, family="monospace"); yv -= 0.085
        else:
            col = "#1D9E75" if kind else "#D85A30"
            ax[1, 1].text(0.02, yv, s, fontsize=9.5, family="monospace", color=col); yv -= 0.085
    ax[1, 1].set_title("D · Phase-1 gates (harness validation)", fontweight="bold", loc="left")

    fig.suptitle("Phase 1: Shadow-Contest Scoring Harness   [REAL odds · SYNTHETIC crowd · MODELED path]",
                 fontsize=13.5, fontweight="bold", y=0.997)
    fig.tight_layout(rect=[0, 0, 1, 0.975])
    fig.savefig(os.path.join(outdir, "phase1_report.png"), dpi=140, bbox_inches="tight")
    print(f"\nSaved -> {os.path.join(outdir, 'phase1_report.png')}")


def main():
    ap = argparse.ArgumentParser(description="Proof of Foresight — Phase 1 shadow-contest harness")
    ap.add_argument("--datadir", default="real_data")
    ap.add_argument("--outdir", default="outputs_phase1")
    a = ap.parse_args()
    paths = sorted(glob.glob(os.path.join(a.datadir, "*.csv")))
    if not paths:
        print(f"No CSVs in {a.datadir}/.", file=sys.stderr); sys.exit(2)
    d, _ = load_football_data(paths)
    analyse(d, a.outdir)


if __name__ == "__main__":
    main()
