"""
Proof of Foresight — Step 1: siting lock_at on real data.

lock_at trades off two opposing forces (lock_frac: 0 = open, 1 = close):
  * lock LATE  -> q_lock ~ q_close -> little market movement left to anticipate
                  -> the CLV "headroom" collapses (nothing left to beat),
                  BUT the q_submit benchmark the user must beat is stronger.
  * lock EARLY -> large headroom, weaker benchmark, BUT user opinion is immature
                  and q_submit is noisier.

This scans, across lock_frac, three real quantities and one synthesis:
  (1) residual headroom  KL(q_close || q_lock)   -- how much the line still moves after lock
  (2) benchmark strength RPS(q_lock)             -- how sharp the line a user must beat already is
  (3) an informed user's mean excess-CLV-vs-(market@lock) at that lock point, with SE
      -> the SYNTHESIS: where is the signal still detectable AND the benchmark already hard?

q_lock at a given lock_frac is modeled on the clr-geodesic from real q_open to real
q_close (the same faithful intermediate the ingestion pipeline uses). All odds are REAL
(football-data.co.uk Pinnacle open + close). The informed user is SYNTHETIC and gets a
noisy view of q_close by construction -- so panel (3) measures the HARNESS's detectability
vs lock timing, not a real-edge claim.

Run:
  python lock_scan.py --datadir real_data --outdir outputs_lockscan
"""
from __future__ import annotations
import argparse, glob, os
import numpy as np

from phase0 import load_football_data, no_vig, clr, cross_entropy, rps, clamp, EPS
from scipy.special import erfc


def softmax(z):
    e = np.exp(z - z.max(-1, keepdims=True)); return e / e.sum(-1, keepdims=True)


def kl(a, b):
    a, b = clamp(a), clamp(b)
    return (a * (np.log(a) - np.log(b))).sum(-1)


def path_point(q_open, q_close, t):
    """clr-geodesic point at fraction t (same intermediate the pipeline uses)."""
    z0, z1 = clr(q_open), clr(q_close)
    return softmax((1 - t) * z0 + t * z1)


def informed_pred(q_lock, q_close, skill, rng):
    """A user partially ahead of the market@lock toward the closing line (CLV-relevant
    information = what the line hasn't absorbed yet but moves toward). Per-match independent
    noise keeps variance non-degenerate."""
    z_target = clr(q_close) + rng.normal(0, 0.10, q_close.shape)
    z = (1 - skill) * clr(q_lock) + skill * z_target
    return softmax(z)


def summ(x):
    x = np.asarray(x, float).ravel(); n = x.size; m = x.mean()
    se = x.std(ddof=1) / np.sqrt(n) if n > 1 else float("nan")
    z = m / se if se and se > 0 else float("nan")
    return m, se, z


def analyse(d, outdir, skill=0.35):
    os.makedirs(outdir, exist_ok=True)
    rng = np.random.default_rng(13)
    y = d.y.to_numpy()
    q_open = no_vig(d[["open_H", "open_D", "open_A"]].to_numpy(float))
    q_close = no_vig(d[["close_H", "close_D", "close_A"]].to_numpy(float))

    # real anchors
    headroom_open = kl(q_close, q_open).mean()      # total open->close divergence (real)
    rps_open = rps(q_open, y).mean()
    rps_close = rps(q_close, y).mean()

    fracs = np.linspace(0.0, 0.98, 25)
    rows = []
    for t in fracs:
        q_lock = path_point(q_open, q_close, t)
        headroom = kl(q_close, q_lock).mean()                 # (1) residual movement after lock
        bench = rps(q_lock, y).mean()                         # (2) benchmark strength (lower=stronger)
        # (3) informed user's excess CLV vs the market@lock, averaged over matches+users
        ex = []
        for _ in range(30):                                   # 30 synthetic informed users
            p = informed_pred(q_lock, q_close, skill, rng)
            ex.append(cross_entropy(q_close, q_lock) - cross_entropy(q_close, p))
        ex = np.array(ex)                                     # (30, N)
        m, se, z = summ(ex)
        rows.append(dict(t=t, headroom=headroom, bench=bench, clv=m, clv_se=se, clv_z=z))

    # ---- synthesis (honest version) ----
    # The informed probe above is monotone in headroom by construction (it always sits
    # closer to q_close than q_lock does), so its excess-CLV cannot be an INDEPENDENT axis
    # for choosing lock — it essentially retraces headroom. We therefore build the objective
    # from the TWO genuinely independent real quantities in tension:
    #     headroom_norm  = KL(close||lock) / KL(close||open)   (want LARGE: room left to beat)
    #     hardness        = captured sharpening of open->close (want LARGE: benchmark already hard)
    # Both are monotone but in OPPOSITE directions; their balance point is the sweet spot.
    # We report the balance as the lock_frac maximizing their geometric mean, AND a band
    # (where the product is within 90% of its max) rather than pretending to a precise constant.
    arr = {k: np.array([r[k] for r in rows]) for k in rows[0]}
    headroom_norm = arr["headroom"] / (headroom_open + 1e-12)            # 1 at open -> 0 at close
    sharp_captured = np.clip((rps_open - arr["bench"]) / max(rps_open - rps_close, 1e-9), 0, 1)
    objective = np.sqrt(np.clip(headroom_norm, 0, 1) * sharp_captured)   # geometric mean
    best_i = int(np.argmax(objective))
    best_t = arr["t"][best_i]
    band = arr["t"][objective >= 0.9 * objective.max()]
    band_lo, band_hi = float(band.min()), float(band.max())

    rep = _report(d, headroom_open, rps_open, rps_close, rows, arr, sharp_captured,
                  headroom_norm, objective, best_i, best_t, band_lo, band_hi, skill)
    with open(os.path.join(outdir, "lock_scan_report.md"), "w") as f:
        f.write(rep)
    print(rep)
    _figure(outdir, arr, sharp_captured, headroom_norm, objective, best_t, rps_open, rps_close)
    return rep


def _report(d, headroom_open, rps_open, rps_close, rows, arr, sharp_captured,
            headroom_norm, objective, best_i, best_t, band_lo, band_hi, skill):
    span = f"{d.date.min().date()} → {d.date.max().date()}" if d.date.notna().any() else ""
    tiny = headroom_open < 0.01
    L = ["# Proof of Foresight — Step 1: siting lock_at on real data",
         "Where to freeze submissions, from REAL Pinnacle open+close odds.\n",
         "=" * 68,
         f"DATA: REAL football-data.co.uk Pinnacle open+close, {len(d)} matches, {span}",
         "OBJECTIVE: geometric mean of (residual headroom) × (benchmark hardness) — two",
         "           REAL, independently-motivated quantities in opposite tension.",
         "=" * 68, "",
         f"  total open->close headroom  KL(q_close||q_open) = {headroom_open:.4f} nats",
         f"  RPS(opening) = {rps_open:.4f}    RPS(closing) = {rps_close:.4f}    "
         f"(sharpening = {rps_open - rps_close:+.4f})", ""]
    if tiny:
        L += ["  *** KEY REAL FINDING ***",
              "  In this league the open->close headroom is TINY (≈0.002 nats): the EPL opening",
              "  Pinnacle line is already almost as sharp as the close. Consequence: lock_at is",
              "  nearly INSENSITIVE here — there is barely any movement to be early for. The",
              "  lock_at tradeoff only bites in markets/competitions with LARGER line movement",
              "  (more news, softer openers). World-Cup group games — upset-prone, info-dense,",
              "  with softer early lines — likely move MORE than mature EPL markets, so lock_at",
              "  matters more there. Re-run this scan on real World-Cup odds to set it for real.", ""]
    L += ["## Scan over lock_frac  (0 = lock at open, 1 = lock at close)",
          f"  {'frac':>5}{'headroom KL':>13}{'head.norm':>11}{'RPS@lock':>10}"
          f"{'hardness':>10}{'objective':>11}"]
    for i, r in enumerate(rows):
        mark = "  <= peak" if i == best_i else (" .band" if band_lo <= r['t'] <= band_hi else "")
        L.append(f"  {r['t']:>5.2f}{r['headroom']:>13.4f}{headroom_norm[i]:>11.2f}"
                 f"{r['bench']:>10.4f}{sharp_captured[i]:>10.2f}{objective[i]:>11.3f}{mark}")
    L += ["",
          "## Recommendation",
          f"  Balance point: lock_frac ≈ {best_t:.2f}; robust band ≈ {band_lo:.2f}–{band_hi:.2f}",
          "  (where the objective is within 90% of its max). Treat it as a BAND, not a constant.",
          "  At the balance point:",
          f"    - {100*headroom_norm[best_i]:.0f}% of the open->close movement is still ahead of users",
          f"    - the benchmark already captures {100*sharp_captured[best_i]:.0f}% of the sharpening",
          "",
          "## How to use this on the real timeline",
          "  lock_frac is clr-distance along open->close, not wall-clock. During the tournament",
          "  the ingestion pipeline should log |q_now - q_open| / |q_close - q_open| per match;",
          "  set lock_at at the minutes-before-kickoff where that ratio typically reaches the",
          "  chosen frac. Recalibrate on World-Cup odds after a few rounds (cup ≠ league).",
          "",
          "  Direction is the robust result: lock NEITHER at open (benchmark too soft, users just",
          "  copy a stale line) NOR at close (no headroom; CLV has nothing to beat). Somewhere in",
          f"  the middle band. In a low-movement league the exact point barely matters; in a",
          "  high-movement event it does."]
    return "\n".join(L)


def _figure(outdir, arr, sharp_captured, headroom_norm, objective, best_t, rps_open, rps_close):
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
    fig, ax = plt.subplots(2, 2, figsize=(13, 9.5))
    C = {"head": "#185FA5", "bench": "#1D9E75", "sig": "#D85A30", "obj": "#7A5AA6", "g": "#888780"}
    t = arr["t"]

    # A — residual headroom after lock
    ax[0, 0].plot(t, arr["headroom"], "-o", color=C["head"], ms=3)
    ax[0, 0].axvline(best_t, color=C["obj"], ls=":", lw=1.5)
    ax[0, 0].set_xlabel("lock_frac (0=open, 1=close)"); ax[0, 0].set_ylabel("KL(q_close || q_lock) nats")
    ax[0, 0].set_title("A · Headroom: market movement still ahead of users", fontweight="bold", loc="left")
    ax[0, 0].annotate("shrinks toward 0\nas lock → close", xy=(0.9, arr["headroom"][-3]),
                      xytext=(0.45, arr["headroom"].max()*0.55), fontsize=8.5,
                      arrowprops=dict(arrowstyle="->", color=C["g"]))

    # B — benchmark strength (RPS@lock), with open/close reference lines
    ax[0, 1].plot(t, arr["bench"], "-o", color=C["bench"], ms=3, label="RPS @ lock")
    ax[0, 1].axhline(rps_open, color=C["g"], ls="--", lw=1, label=f"RPS open {rps_open:.3f}")
    ax[0, 1].axhline(rps_close, color=C["sig"], ls="--", lw=1, label=f"RPS close {rps_close:.3f}")
    ax[0, 1].axvline(best_t, color=C["obj"], ls=":", lw=1.5)
    ax[0, 1].set_xlabel("lock_frac"); ax[0, 1].set_ylabel("RPS @ lock (lower = harder benchmark)")
    ax[0, 1].set_title("B · Benchmark the user must beat hardens toward close", fontweight="bold", loc="left")
    ax[0, 1].legend(frameon=False, fontsize=8)

    # C — informed excess-CLV signal-to-noise
    ax[1, 0].plot(t, arr["clv_z"], "-o", color=C["sig"], ms=3)
    ax[1, 0].axvline(best_t, color=C["obj"], ls=":", lw=1.5)
    ax[1, 0].set_xlabel("lock_frac"); ax[1, 0].set_ylabel("excess-CLV z (signal / noise)")
    ax[1, 0].set_title("C · Informed probe z (retraces headroom — not used to decide)", fontweight="bold", loc="left", fontsize=9.8)
    ax[1, 0].annotate("collapses as lock → close\n(no headroom left to beat)",
                      xy=(0.92, arr["clv_z"][-2]), xytext=(0.30, arr["clv_z"].max()*0.45),
                      fontsize=8.5, arrowprops=dict(arrowstyle="->", color=C["g"]))

    # D — the synthesis (two real, opposed quantities)
    ax[1, 1].plot(t, sharp_captured, "--", color=C["bench"], lw=1.5, label="benchmark hardness")
    ax[1, 1].plot(t, np.clip(arr["headroom"]/(arr["headroom"][0]+1e-12),0,1), "--",
                  color=C["head"], lw=1.5, label="residual headroom (norm.)")
    ax[1, 1].plot(t, objective, "-", color=C["obj"], lw=2.5, label="objective = geo-mean")
    band = t[objective >= 0.9*objective.max()]
    ax[1, 1].axvspan(band.min(), band.max(), color=C["obj"], alpha=0.10, label="90% band")
    ax[1, 1].axvline(best_t, color=C["obj"], ls=":", lw=1.5)
    ax[1, 1].scatter([best_t], [objective.max()], s=110, color=C["obj"], zorder=5,
                     label=f"balance ≈ {best_t:.2f}")
    ax[1, 1].set_xlabel("lock_frac"); ax[1, 1].set_ylabel("normalized")
    ax[1, 1].set_title("D · Synthesis: headroom × hardness", fontweight="bold", loc="left")
    ax[1, 1].legend(frameon=False, fontsize=7.5)

    fig.suptitle("Step 1: where to site lock_at   [REAL odds · synthetic informed probe]",
                 fontsize=14, fontweight="bold", y=0.997)
    fig.tight_layout(rect=[0, 0, 1, 0.975])
    fig.savefig(os.path.join(outdir, "lock_scan_report.png"), dpi=140, bbox_inches="tight")
    print(f"\nSaved -> {os.path.join(outdir, 'lock_scan_report.png')}")


def main():
    ap = argparse.ArgumentParser(description="PoF Step 1 — site lock_at on real data")
    ap.add_argument("--datadir", default="real_data")
    ap.add_argument("--outdir", default="outputs_lockscan")
    ap.add_argument("--skill", type=float, default=0.35)
    a = ap.parse_args()
    paths = sorted(glob.glob(os.path.join(a.datadir, "*.csv")))
    if not paths:
        raise SystemExit(f"No CSVs in {a.datadir}/")
    d, _ = load_football_data(paths)
    analyse(d, a.outdir, skill=a.skill)


if __name__ == "__main__":
    main()
