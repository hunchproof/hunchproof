"""
Proof of Foresight — Phase 0: The Closing-Line Bar.
A reproducible pipeline showing why public models can beat naive baselines but
fail to beat the market's final line. Phase 0 proves the MEASUREMENT HARNESS,
not crowd alpha.

USAGE
  python phase0.py --download --seasons 2122 2223 2324 2425 2526 --league E0 --datadir data
  python phase0.py --datadir data --outdir outputs       # REAL data
  python phase0.py --demo --outdir outputs               # SYNTHETIC validation
"""
from __future__ import annotations
import argparse, glob, os, sys, urllib.request
import numpy as np
import pandas as pd
from scipy.special import factorial, erfc

RES = ["H", "D", "A"]; RES_IX = {"H": 0, "D": 1, "A": 2}
EPS = 1e-6
FD_BASE = "https://www.football-data.co.uk/mmz4281"
FOOTBALL_PRIOR = (0.44, 0.27, 0.29)
LOGLOSS_MAX = -np.log(EPS)


# ---------------- scoring & probability utilities ----------------
def clamp(P):
    P = np.clip(np.asarray(P, float), EPS, None); return P / P.sum(-1, keepdims=True)

def rps(P, y):
    P = np.atleast_2d(P); O = np.eye(3)[np.asarray(y)]
    cp, co = np.cumsum(P, 1), np.cumsum(O, 1)
    return 0.5 * ((cp[:, 0] - co[:, 0]) ** 2 + (cp[:, 1] - co[:, 1]) ** 2)

def log_loss(P, y):
    P = clamp(P); return -np.log(P[np.arange(len(P)), np.asarray(y)])

def clr(P):
    L = np.log(clamp(P)); return L - L.mean(-1, keepdims=True)

def cross_entropy(qref, p):
    qref, p = clamp(qref), clamp(p); return -(qref * np.log(p)).sum(-1)

def no_vig(o):
    o = np.asarray(o, float); inv = 1.0 / o; return inv / inv.sum(-1, keepdims=True)

def poisson_1x2(lh, la, kmax=11):
    ks = np.arange(kmax); f = factorial(ks)
    ph = np.exp(-lh) * lh ** ks / f; pa = np.exp(-la) * la ** ks / f
    M = np.outer(ph, pa)
    return clamp(np.array([np.tril(M, -1).sum(), np.trace(M), np.triu(M, 1).sum()]))

def clv_kl(p, q_open, q_close):
    """Pre-outcome CLV = CE(q_close,q_open) - CE(q_close,p). >0 => p anticipated the
    closing line better than the opening market did. No outcome used -> low variance."""
    return cross_entropy(q_close, q_open) - cross_entropy(q_close, p)

def rolling_climatology(y, prior=FOOTBALL_PRIOR, prior_n=20.0):
    P = np.zeros((len(y), 3)); cum = np.zeros(3); n = 0.0; pri = np.array(prior) * prior_n
    for i, yy in enumerate(y):
        P[i] = (cum + pri) / (n + prior_n); cum[int(yy)] += 1; n += 1
    return clamp(P)

def summ(x):
    x = np.asarray(x, float); n = len(x); m = x.mean()
    se = x.std(ddof=1) / np.sqrt(n) if n > 1 else float("nan")
    return m, se, n


# ---------------- ingestion (football-data.co.uk schema) ----------------
ODDS_SETS = {
    "open":  [("PSH", "PSD", "PSA"), ("AvgH", "AvgD", "AvgA"), ("B365H", "B365D", "B365A")],
    "close": [("PSCH", "PSCD", "PSCA"), ("AvgCH", "AvgCD", "AvgCA"), ("B365CH", "B365CD", "B365CA")],
    "avgc":  [("AvgCH", "AvgCD", "AvgCA"), ("MaxCH", "MaxCD", "MaxCA")],
}
SRC_NAME = {"PS": "Pinnacle", "PSC": "Pinnacle-closing", "Avg": "market-avg",
            "AvgC": "market-avg-closing", "B365": "Bet365", "B365C": "Bet365-closing",
            "MaxC": "market-max-closing"}

def _pick(df, candidates):
    for trip in candidates:
        if all(c in df.columns for c in trip):
            return trip
    return None

def _prefix(trip):
    return trip[0][:-1] if trip else None

def load_football_data(paths):
    frames = []; rows_raw = 0; files_used = 0
    for p in paths:
        try:
            df = pd.read_csv(p, encoding="latin-1")
        except Exception as e:
            print(f"  ! skip {p}: {e}"); continue
        if "FTR" not in df.columns and {"FTHG", "FTAG"}.issubset(df.columns):
            df["FTR"] = np.where(df.FTHG > df.FTAG, "H", np.where(df.FTHG < df.FTAG, "A", "D"))
        t_open, t_close = _pick(df, ODDS_SETS["open"]), _pick(df, ODDS_SETS["close"])
        if "FTR" not in df.columns or t_open is None or t_close is None:
            print(f"  ! skip {os.path.basename(p)}: need FTR + opening + closing odds"); continue
        keep = {"Date": "date", "HomeTeam": "home", "AwayTeam": "away", "FTR": "ftr",
                "FTHG": "fthg", "FTAG": "ftag"}
        sub = pd.DataFrame({v: df[k] for k, v in keep.items() if k in df.columns})
        sub["file"] = os.path.basename(p)
        for role in ("open", "close", "avgc"):
            trip = _pick(df, ODDS_SETS[role]) or (t_close if role == "avgc" else None)
            sub[f"{role}_src"] = _prefix(trip)
            sub[[f"{role}_H", f"{role}_D", f"{role}_A"]] = df[list(trip)].astype(float).values
        frames.append(sub); rows_raw += len(df); files_used += 1
    if not frames:
        raise SystemExit("No usable football-data CSVs (need FTR + PSH/PSD/PSA + PSCH/PSCD/PSCA).")
    d = pd.concat(frames, ignore_index=True)
    d = d.dropna(subset=["ftr", "open_H", "open_D", "open_A", "close_H", "close_D", "close_A"])
    d = d[d.ftr.isin(RES)].copy()
    d["date"] = pd.to_datetime(d["date"], dayfirst=True, errors="coerce")
    d = d.sort_values("date", kind="stable").reset_index(drop=True)
    d["y"] = d.ftr.map(RES_IX).astype(int)
    ingest = dict(files=files_used, rows_raw=rows_raw, rows_kept=len(d), dropped=rows_raw - len(d))
    return d, ingest

def market_probs(d, role):
    o = d[[f"{role}_H", f"{role}_D", f"{role}_A"]].to_numpy(float)
    return no_vig(o), (1.0 / o).sum(1) - 1.0

def odds_source_summary(d):
    out = {}
    for role in ("open", "close"):
        vc = d[f"{role}_src"].value_counts(dropna=False)
        out[role] = ", ".join(f"{SRC_NAME.get(k, k)}×{int(v)}" for k, v in vc.items())
    return out


# ---------------- out-of-sample public model: rolling shrunk-Poisson ----------------
def rolling_poisson_predictions(d, prior_games=4.0, home_adv=1.15, burn_in=60):
    has_goals = {"fthg", "ftag"}.issubset(d.columns); fabricated = not has_goals
    gf, ga, gp = {}, {}, {}; sum_goals, n_games = 0.0, 0
    P = np.full((len(d), 3), np.nan)
    for i, r in enumerate(d.itertuples(index=False)):
        h, a = r.home, r.away
        lg = (sum_goals / n_games) if n_games > 0 else 1.35
        def rate(t, attack=True):
            g = gp.get(t, 0.0); val = gf.get(t, 0.0) if attack else ga.get(t, 0.0)
            return (val + prior_games * lg) / (g + prior_games) / max(lg, 1e-6)
        if i >= burn_in and gp.get(h, 0) >= 3 and gp.get(a, 0) >= 3:
            lh = lg * rate(h, True) * rate(a, False) * home_adv
            la = lg * rate(a, True) * rate(h, False) / home_adv
            P[i] = poisson_1x2(lh, la)
        if has_goals and pd.notna(getattr(r, "fthg", None)) and pd.notna(getattr(r, "ftag", None)):
            hg, ag = float(r.fthg), float(r.ftag)
        else:
            hg, ag = {"H": (2.0, 0.0), "D": (1.0, 1.0), "A": (0.0, 2.0)}[r.ftr]
        for t, fgo, ago in ((h, hg, ag), (a, ag, hg)):
            gf[t] = gf.get(t, 0.0) + fgo; ga[t] = ga.get(t, 0.0) + ago; gp[t] = gp.get(t, 0.0) + 1.0
        sum_goals += hg + ag; n_games += 2
    return P, fabricated


# ---------------- analysis ----------------
def analyse(d, outdir, provenance, ingest):
    os.makedirs(outdir, exist_ok=True)
    y = d.y.to_numpy()
    q_open, m_open = market_probs(d, "open")
    q_close, m_close = market_probs(d, "close")
    q_avgc, _ = market_probs(d, "avgc")
    clim = rolling_climatology(y)
    full = dict(clim=rps(clim, y).mean(), open=rps(q_open, y).mean(),
                avgc=rps(q_avgc, y).mean(), close=rps(q_close, y).mean())

    model, fabricated = rolling_poisson_predictions(d)
    mask = ~np.isnan(model[:, 0]); ym = y[mask]; pm = clamp(model[mask])
    qo, qc, cl = q_open[mask], q_close[mask], clim[mask]
    scored = dict(clim=rps(cl, ym).mean(), open=rps(qo, ym).mean(),
                  close=rps(qc, ym).mean(), model=rps(pm, ym).mean())

    a_close = rps(qc, ym) - rps(pm, ym)
    a_open = rps(qo, ym) - rps(pm, ym)
    clv_m = clv_kl(pm, qo, qc)
    eff = rps(q_open, y) - rps(q_close, y)

    src = odds_source_summary(d)
    rep = _report(d, provenance, ingest, int(mask.sum()), src, fabricated, full, scored,
                  m_open.mean(), m_close.mean(), summ(eff), summ(a_close), summ(a_open), summ(clv_m))
    with open(os.path.join(outdir, "phase0_report.md"), "w") as f:
        f.write(rep)
    print(rep)

    ex = d.loc[mask, ["date", "home", "away", "ftr", "open_src", "close_src"]].copy()
    for nm, arr in [("q_open", qo), ("q_close", qc), ("model", pm)]:
        ex[[f"{nm}_H", f"{nm}_D", f"{nm}_A"]] = arr
    ex["rps_close"] = rps(qc, ym); ex["rps_model"] = rps(pm, ym)
    ex["alpha_close"] = a_close; ex["clv_model"] = clv_m
    ex.to_csv(os.path.join(outdir, "phase0_per_match.csv"), index=False)

    _figure(outdir, provenance, scored, eff, a_close, clv_m, qc, ym)
    return rep


def _report(d, provenance, ingest, n_scored, src, fabricated, full, scored,
            mo, mc, eff, ac, ao, clv):
    def line(m, se, n):
        z = m / se if se and se == se and se > 0 else float("nan")
        p = 0.5 * erfc(abs(z) / np.sqrt(2)) if z == z else float("nan")
        verdict = "clears 90% bar (|z|>=1.64)" if abs(z) >= 1.64 else "below 90% bar"
        return f"mean={m:+.4f}  SE={se:.4f}  (n={n})  z={z:+.2f}  one-sided p={p:.1e}  -> {verdict}"
    span = f"{d.date.min().date()} → {d.date.max().date()}" if d.date.notna().any() else ""

    # ---- acceptance gates (read first) ----
    eff_m, eff_se, _ = eff; z_eff = eff_m / eff_se if eff_se and eff_se > 0 else float("nan")
    g1 = "PASS" if (eff_m > 0 and abs(z_eff) >= 1.64) else ("PARTIAL" if eff_m > 0 else "FAIL")
    g2 = "PASS" if (full["clim"] > full["open"] and full["clim"] > full["close"]) else "FAIL"
    ac_m, ac_se, _ = ac; clv_m_, clv_se_, _ = clv
    g3 = "PASS" if (scored["model"] > scored["close"] and ac_m < 0) else "FAIL"
    g4 = "PASS" if (clv_se_ == clv_se_ and ac_se == ac_se and clv_se_ < ac_se) else "FAIL"

    L = ["# Proof of Foresight — Phase 0: The Closing-Line Bar",
         "A reproducible pipeline showing why public models can beat naive baselines",
         "but fail to beat the market's final line.\n",
         "=" * 66, f"DATA PROVENANCE: {provenance}", "=" * 66, ""]
    L.append("## Method")
    L.append(f"  odds source        : opening = {src['open']}")
    L.append(f"                       closing = {src['close']}")
    L.append(f"  matches ingested   : {ingest['rows_raw']}   complete-odds: {ingest['rows_kept']}   "
             f"dropped: {ingest['dropped']} (missing result/odds or non-H/D/A)")
    L.append(f"  model-scored (OOS) : {n_scored}")
    L.append(f"  bookmaker margin   : opening {mo*100:.2f}%   closing {mc*100:.2f}%")
    L.append("  no-vig method      : proportional (basic) de-vig")
    L.append("  scoring rule       : RPS (ordinal H>D>A, strictly proper); log-loss diagnostic")
    L.append("  model              : rolling shrunk-Poisson, walk-forward; trained on prior matches "
             "only; burn-in 60; team needs >=3 prior games")
    L.append("  climatology        : rolling/expanding with Dirichlet prior (no full-sample peek)")
    L.append("  leakage policy     : every forecast uses only pre-match information")
    if fabricated:
        L.append("  WARNING            : goal columns absent -> model on fabricated pseudo-scores (not representative)")
    L.append("")
    L.append("## 0. Acceptance gates (read these first)")
    L.append(f"  [G1] line efficiency (HARD precondition): {g1}  — close beats open by {eff_m:+.4f} (z={z_eff:+.2f})")
    L.append("       if FAIL, CLV anticipates noise -> the CLV-based MVP is NOT valid here (switch league/window)")
    L.append(f"  [G2] climatology is the floor          : {g2}  — market lines beat rolling climatology")
    L.append(f"  [G3] public model loses to closing     : {g3}  — model {scored['model']:.4f} vs closing "
             f"{scored['close']:.4f}; realized alpha {ac_m:+.4f}")
    L.append(f"  [G4] CLV var << realized-alpha var      : {g4}  — SE_clv {clv_se_:.4f} vs SE_alpha {ac_se:.4f}")
    L.append("")
    L.append("## 1a. Full-sample market baselines — RPS (lower = better)")
    for k, nm in [("clim", "rolling climatology"), ("open", "opening (no-vig)"),
                  ("avgc", "market-average closing"), ("close", "CLOSING (no-vig)  <- THE BAR")]:
        L.append(f"  {nm:<34} RPS = {full[k]:.4f}")
    L.append("")
    L.append("## 1b. Model-scored sample — fair like-for-like comparison")
    for k, nm in [("clim", "rolling climatology"), ("open", "opening"),
                  ("close", "CLOSING  <- THE BAR"), ("model", "rolling-Poisson model (OOS)")]:
        L.append(f"  {nm:<34} RPS = {scored[k]:.4f}")
    L.append("  (baselines restricted to the SAME matches the model scores.)\n")
    L.append("## 2. Line efficiency  (RPS_open - RPS_close, paired over outcomes)")
    L.append("  positive => closing more accurate than opening. PRECONDITION for CLV as an edge metric:")
    L.append("  if it fails, CLV measures anticipation of noise, not of genuine information.")
    L.append("  " + line(*eff) + "\n")
    L.append("## 3. Model vs the closing line")
    L.append("  realized alpha vs CLOSING (outcome-based, HIGH variance): " + line(*ac))
    L.append("  realized alpha vs OPENING  (outcome-based):              " + line(*ao))
    L.append("  pre-outcome CLV vs closing (no outcome used, LOW var):   " + line(*clv) + "\n")
    L.append("## 4. Reading this")
    L.append("  - The closing line is the bar; a simple public model should NOT beat it.")
    L.append("  - realized-alpha-vs-closing is high variance -> usually undetectable over a short")
    L.append("    horizon even if a real edge exists. CLV integrates out the outcome.")
    L.append("  - => MVP success = positive pre-lock CLV from an auditable, pre-committed,")
    L.append("    non-cherry-picked slate with good calibration; realized alpha accumulates")
    L.append("    across seasons — never a one-tournament verdict.")
    return "\n".join(L)


def _figure(outdir, provenance, scored, eff, a_close, clv, qc, ym):
    import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
    plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
    fig, ax = plt.subplots(2, 2, figsize=(13, 9.7))
    C = {"bar": "#185FA5", "close": "#1D9E75", "bad": "#D85A30", "g": "#888780"}
    keys = ["clim", "open", "close", "model"]
    names = ["rolling\nclimatology", "opening", "CLOSING\n(bar)", "model\n(OOS)"]
    vals = [scored[k] for k in keys]; cols = [C["g"], C["bar"], C["close"], C["bad"]]
    b = ax[0, 0].bar(names, vals, color=cols, width=0.7)
    ax[0, 0].axhline(scored["close"], color=C["close"], ls=":", lw=1)
    ax[0, 0].set_ylim(min(vals) * 0.985, max(vals) * 1.012); ax[0, 0].set_ylabel("RPS (model-scored sample)")
    ax[0, 0].set_title("A · The bar (fair like-for-like sample)", fontweight="bold", loc="left")
    for bb, v in zip(b, vals):
        ax[0, 0].text(bb.get_x() + bb.get_width() / 2, v, f"{v:.4f}", ha="center", va="bottom", fontsize=8)
    ax[0, 1].axvline(0, color=C["g"], ls=":", lw=1); ax[0, 1].hist(eff, bins=40, color=C["close"], alpha=0.85)
    ax[0, 1].axvline(eff.mean(), color=C["bad"], lw=2, label=f"mean {eff.mean():+.4f}")
    ax[0, 1].set_xlabel("RPS(opening) − RPS(closing) per match"); ax[0, 1].set_ylabel("matches")
    ax[0, 1].set_title("B · Line efficiency = CLV's validity precondition", fontweight="bold", loc="left")
    ax[0, 1].legend(frameon=False, fontsize=9)
    ax[1, 0].axhline(0, color=C["g"], ls=":", lw=1); ax[1, 0].axvline(0, color=C["g"], ls=":", lw=1)
    ax[1, 0].scatter(clv, a_close, s=12, c=C["bar"], alpha=0.5)
    ax[1, 0].scatter([clv.mean()], [a_close.mean()], s=120, c=C["bad"], marker="X", zorder=5,
                     label=f"mean ({clv.mean():+.4f}, {a_close.mean():+.4f})")
    ax[1, 0].set_xlabel("pre-outcome CLV vs closing  (low variance)")
    ax[1, 0].set_ylabel("realized alpha vs closing  (high variance)")
    ax[1, 0].set_title("C · Beating the closing line is hard", fontweight="bold", loc="left")
    ax[1, 0].legend(frameon=False, fontsize=8.5, loc="upper left")
    P = clamp(qc); O = np.eye(3)[ym]; pp, oo = P.ravel(), O.ravel()
    bins = np.linspace(0, 1, 11); idx = np.clip(np.digitize(pp, bins) - 1, 0, 9); bx, by = [], []
    for k in range(10):
        m = idx == k
        if m.sum() > 5:
            bx.append(pp[m].mean()); by.append(oo[m].mean())
    ax[1, 1].plot([0, 1], [0, 1], color=C["g"], ls="--", lw=1, label="perfect")
    ax[1, 1].plot(bx, by, "-o", color=C["close"], lw=2, label="closing line")
    ax[1, 1].set_xlabel("predicted probability (closing line)"); ax[1, 1].set_ylabel("observed frequency")
    ax[1, 1].set_title("D · Closing-line calibration", fontweight="bold", loc="left")
    ax[1, 1].legend(frameon=False, fontsize=9)
    tag = "SYNTHETIC DEMO — pipeline validation only" if provenance.lower().startswith("synthetic") else "real data"
    fig.suptitle(f"Phase 0: The Closing-Line Bar   [{tag}]", fontsize=14, fontweight="bold", y=0.995)
    fig.tight_layout(rect=[0, 0, 1, 0.975])
    fig.savefig(os.path.join(outdir, "phase0_report.png"), dpi=140, bbox_inches="tight")
    print(f"\nSaved -> {os.path.join(outdir, 'phase0_report.png')}")


# ---------------- data acquisition + demo ----------------
def download(seasons, league, datadir):
    os.makedirs(datadir, exist_ok=True); out = []
    for s in seasons:
        url = f"{FD_BASE}/{s}/{league}.csv"; dst = os.path.join(datadir, f"{league}_{s}.csv")
        try:
            urllib.request.urlretrieve(url, dst); out.append(dst); print(f"  downloaded {url}")
        except Exception as e:
            print(f"  ! failed {url}: {e}")
    return out

def make_demo(datadir, seasons=4, teams=20, seed=7):
    os.makedirs(datadir, exist_ok=True); rng = np.random.default_rng(seed); MU, HOME = 0.15, 0.25
    atk = rng.normal(0, 0.35, teams); dfn = rng.normal(0, 0.35, teams)
    for s in range(seasons):
        atk = atk + rng.normal(0, 0.05, teams); dfn = dfn + rng.normal(0, 0.05, teams)
        rows = []; day = pd.Timestamp("2020-08-08") + pd.Timedelta(days=365 * s)
        for h in range(teams):
            for a in range(teams):
                if h == a:
                    continue
                lh = np.exp(MU + HOME + atk[h] - dfn[a]); la = np.exp(MU + atk[a] - dfn[h])
                hg, ag = rng.poisson(lh), rng.poisson(la)
                ftr = "H" if hg > ag else ("A" if hg < ag else "D"); true = poisson_1x2(lh, la)
                qc = clamp(true * np.exp(rng.normal(0, 0.06, 3))); qo = clamp(true * np.exp(rng.normal(0, 0.16, 3)))
                qa = clamp(qc * np.exp(rng.normal(0, 0.03, 3))); to = lambda p, mg: np.round((1.0 / p) / (1 + mg), 3)
                rows.append([day.strftime("%d/%m/%Y"), f"T{h:02d}", f"T{a:02d}", hg, ag, ftr,
                             *to(qo, 0.05), *to(qc, 0.025), *to(qa, 0.04)])
                day += pd.Timedelta(hours=8)
        cols = ["Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG", "FTR",
                "PSH", "PSD", "PSA", "PSCH", "PSCD", "PSCA", "AvgCH", "AvgCD", "AvgCA"]
        pd.DataFrame(rows, columns=cols).to_csv(os.path.join(datadir, f"DEMO_season{s}.csv"), index=False)
    print(f"  wrote {seasons} synthetic football-data-format CSVs to {datadir}/")
    return sorted(glob.glob(os.path.join(datadir, "DEMO_*.csv")))


def main():
    ap = argparse.ArgumentParser(description="Proof of Foresight — Phase 0 real-odds backtest")
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--seasons", nargs="+", default=["2122", "2223", "2324", "2425", "2526"])
    ap.add_argument("--league", default="E0")
    ap.add_argument("--datadir", default="data")
    ap.add_argument("--outdir", default="outputs")
    ap.add_argument("--demo", action="store_true")
    a = ap.parse_args()
    if a.demo:
        paths = make_demo(a.datadir)
        provenance = "SYNTHETIC DEMO DATA — pipeline validation only, NOT empirical evidence."
    elif a.download:
        paths = download(a.seasons, a.league, a.datadir)
        if not paths:
            print("Download failed (network policy?). Drop CSVs in the data dir and use --datadir.",
                  file=sys.stderr); sys.exit(2)
        provenance = f"REAL DATA (football-data.co.uk): {a.league} seasons {', '.join(a.seasons)}."
    else:
        paths = sorted(glob.glob(os.path.join(a.datadir, "*.csv")))
        if not paths:
            print(f"No CSVs in {a.datadir}/. Use --download, --demo, or drop football-data CSVs there.",
                  file=sys.stderr); sys.exit(2)
        names = ', '.join(os.path.basename(p) for p in paths[:6]) + ('…' if len(paths) > 6 else '')
        provenance = f"REAL DATA: {len(paths)} file(s) from {a.datadir}/ ({names})."
    d, ingest = load_football_data(paths)
    analyse(d, a.outdir, provenance, ingest)


if __name__ == "__main__":
    main()
