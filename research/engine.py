"""
Proof of Foresight — scoring & aggregation engine.

Pure, deterministic, vectorised primitives. No I/O, no global state.
Outcome categories are ORDERED (e.g. Home, Draw, Away by goal difference),
which is why RPS — not plain Brier — is the primary metric.
"""
from __future__ import annotations
import numpy as np

EPS = 1e-4  # probability floor: keeps log-score finite, never claim 0% or 100%


def clamp_probs(p: np.ndarray) -> np.ndarray:
    """Floor every probability to EPS and renormalise so each row sums to 1."""
    p = np.clip(p, EPS, 1.0 - EPS)
    return p / p.sum(axis=-1, keepdims=True)


def rps(forecast: np.ndarray, outcome_idx: np.ndarray) -> np.ndarray:
    """
    Ranked Probability Score for ordered categories. Lower is better.
    forecast: (..., K) probability rows.  outcome_idx: (...) realised category.
    Scores on the CUMULATIVE distribution, so a near-miss (Draw when you said
    Home) is penalised less than a far-miss (Away). Strictly proper.
    """
    K = forecast.shape[-1]
    onehot = np.eye(K)[outcome_idx]
    cdf_f = np.cumsum(forecast, axis=-1)[..., :-1]
    cdf_o = np.cumsum(onehot, axis=-1)[..., :-1]
    return np.sum((cdf_f - cdf_o) ** 2, axis=-1) / (K - 1)


def log_loss(forecast: np.ndarray, outcome_idx: np.ndarray) -> np.ndarray:
    """Ignorance / surprisal: -ln(p_realised). Strictly proper. Lower is better."""
    f = clamp_probs(forecast)
    p_true = np.take_along_axis(f, outcome_idx[..., None], axis=-1)[..., 0]
    return -np.log(p_true)


def skill_score(score_model: float, score_ref: float) -> float:
    """1 - model/ref.  >0 means the model beats the reference forecaster."""
    return 1.0 - score_model / score_ref


def climatology(outcomes: np.ndarray, K: int) -> np.ndarray:
    """Unconditional base-rate forecast from observed outcome frequencies."""
    counts = np.bincount(outcomes, minlength=K).astype(float)
    return counts / counts.sum()


def linear_pool(forecasts: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """Weighted arithmetic mean of forecasts.  forecasts:(F,M,K) -> (M,K)."""
    w = weights / weights.sum()
    return clamp_probs(np.tensordot(w, forecasts, axes=(0, 0)))


def log_opinion_pool(forecasts: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """
    Weighted GEOMETRIC mean (log-linear pool). forecasts:(F,M,K) -> (M,K).
    Sharper / better-calibrated than linear pooling and 'externally Bayesian'
    under KL — the natural pool for a calibration-weighted crowd oracle.
    """
    w = weights / weights.sum()
    f = np.clip(forecasts, EPS, 1.0)
    logp = np.tensordot(w, np.log(f), axes=(0, 0))            # (M, K)
    p = np.exp(logp - logp.max(axis=-1, keepdims=True))       # stabilise
    return p / p.sum(axis=-1, keepdims=True)


def calibration_weights(train_rps: np.ndarray, ref_rps: float, n_obs: np.ndarray,
                        gamma: float = 1.5, k: float = 25.0) -> np.ndarray:
    """
    w_i = max(0, skill_i)**gamma * shrinkage(n_i)

    skill_i  : 1 - RPS_i / RPS_climatology  (>0 only if you beat base rates)
    gamma    : sharpen the gap between skilled and mediocre forecasters
    shrinkage: n_i/(n_i+k) -> thin/empty track records get ~0 weight.

    Consequence: a brand-new or random (sybil) account earns ~0 weight, so it
    cannot move the aggregate. Influence is EARNED through proven calibration,
    never bought through account count.
    """
    skill = np.maximum(0.0, 1.0 - train_rps / ref_rps)
    shrink = n_obs / (n_obs + k)
    return (skill ** gamma) * shrink


def reliability(forecast: np.ndarray, outcome_idx: np.ndarray, K: int, bins: int = 10):
    """
    Calibration curve over ALL per-class probabilities: when this source says
    'p', does the event happen ~p of the time? Returns (pred, obs, count).
    Perfect calibration => points lie on the diagonal.
    """
    onehot = np.eye(K)[outcome_idx]
    p = forecast.reshape(-1)
    y = onehot.reshape(-1)
    edges = np.linspace(0.0, 1.0, bins + 1)
    idx = np.clip(np.digitize(p, edges) - 1, 0, bins - 1)
    pred, obs, cnt = np.zeros(bins), np.zeros(bins), np.zeros(bins)
    for b in range(bins):
        m = idx == b
        if m.any():
            pred[b], obs[b], cnt[b] = p[m].mean(), y[m].mean(), m.sum()
    return pred, obs, cnt


# ---------------------------------------------------------------------------
# v2 additions: market-relative alpha & decorrelation (anti-laundering)
# ---------------------------------------------------------------------------

def market_relative_alpha(user_rps_per_match: np.ndarray,
                          baseline_rps_per_match: np.ndarray) -> float:
    """
    Mean ΔRPS = RPS(public baseline at submission) - RPS(user). Lower RPS is
    better, so positive alpha means the forecaster BEAT the public market.
    A pure copier scores ~0 (they ARE the market); only genuine private
    information yields persistent positive alpha. ΔRPS stays strictly proper
    in the user's report (the baseline term is user-independent per match).
    """
    return float(np.mean(baseline_rps_per_match - user_rps_per_match))


def alpha_weights(alpha: np.ndarray, n_obs: np.ndarray,
                  gamma: float = 2.0, k: float = 25.0) -> np.ndarray:
    """Oracle weight from market-relative alpha (not absolute calibration)."""
    a = np.maximum(0.0, alpha)
    return (a ** gamma) * (n_obs / (n_obs + k))


def tight_cluster_cap(residuals: np.ndarray, weights: np.ndarray,
                      sim_threshold: float = 0.92) -> np.ndarray:
    """
    Decorrelation guard. Cluster forecasters whose market-residual vectors
    (prediction - market, over the training window) are NEAR-IDENTICAL
    (cosine > threshold) and divide each member's weight by the cluster size.

    This caps blatant coordination — a farm of accounts submitting the same
    tweaked-from-market vector to amplify one opinion. A genuinely diverse
    crowd (each holding independent private noise) is only loosely correlated
    and passes through uncapped. It does NOT solve the hard middle case of
    moderate correlation; that needs error-covariance / precision weighting.
    """
    F = residuals.shape[0]
    r = residuals - residuals.mean(axis=1, keepdims=True)
    norm = np.linalg.norm(r, axis=1, keepdims=True)
    rn = np.where(norm > 1e-9, r / np.maximum(norm, 1e-12), 0.0)
    C = rn @ rn.T
    parent = list(range(F))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    for i in range(F):
        if norm[i, 0] <= 1e-9:
            continue
        for j in range(i + 1, F):
            if norm[j, 0] > 1e-9 and C[i, j] > sim_threshold:
                parent[find(i)] = find(j)

    sizes = {}
    for i in range(F):
        root = find(i)
        sizes[root] = sizes.get(root, 0) + 1
    adj = weights.astype(float).copy()
    for i in range(F):
        c = sizes[find(i)]
        if c > 1:
            adj[i] /= c
    return adj
