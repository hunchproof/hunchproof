"""
Proof of Foresight — MVP backend (FastAPI + SQLite).

Turns the commit-only terminal into a real end-to-end loop. Key security choices:
  * commit-reveal uses the SAME canonical scheme as the browser (verified byte-for-byte
    in commitment_reference.py) — reveal recomputes SHA-256 and rejects any mismatch.
  * the server AUTHORITATIVELY snapshots q_submit at receipt time; it does NOT trust the
    client's claimed market (this is the latency-arbitrage defense's engineering anchor).
  * submissions after lock_at are rejected; one prediction per (user, match) per slate.
  * non-revealed commitments are scored worst-case by the leaderboard (anti-cherry-pick).

Run:
  pip install fastapi uvicorn --break-system-packages
  uvicorn pof_backend:app --reload --port 8000
Then point the terminal's Backend.* calls at http://localhost:8000.

This file is intentionally single-file and storage-light (SQLite) so it runs anywhere;
the table shapes mirror mvp_schema.sql and port to Postgres unchanged.
"""
from __future__ import annotations
import hashlib, math, os, sqlite3, time
from contextlib import contextmanager
from typing import Optional

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field, conlist
except Exception as e:  # pragma: no cover
    raise SystemExit("pip install fastapi uvicorn --break-system-packages  (then rerun)") from e

DB = os.environ.get("POF_DB", "pof_mvp.db")
SCHEME = "PoF|v1"
RPS_MAX = 1.0                 # worst-case RPS for a 3-outcome ordinal score
LOGLOSS_MAX = -math.log(1e-6) # worst-case log-loss


# --------------------------------------------------------------------------- #
# canonical commitment scheme (identical to the browser & commitment_reference.py)
# --------------------------------------------------------------------------- #
def quantize_permille(h: float, d: float, a: float) -> list[int]:
    s = h + d + a
    raw = [h / s * 1000, d / s * 1000, a / s * 1000]
    fl = [math.floor(x) for x in raw]
    rem = 1000 - sum(fl)
    order = sorted(range(3), key=lambda i: raw[i] - fl[i], reverse=True)
    for k in range(rem):
        fl[order[k]] += 1
    return fl


def preimage(match_id: int, perm: list[int], salt_hex: str) -> str:
    return f"{SCHEME}|{match_id}|{perm[0]}-{perm[1]}-{perm[2]}|{salt_hex}"


def commitment(match_id: int, perm: list[int], salt_hex: str) -> str:
    return hashlib.sha256(preimage(match_id, perm, salt_hex).encode()).hexdigest()


def no_vig(o):
    inv = [1.0 / x for x in o]; s = sum(inv)
    return [x / s for x in inv]


def rps_ordinal(p, y_index):
    o = [0, 0, 0]; o[y_index] = 1
    cp = [p[0], p[0] + p[1], 1.0]; co = [o[0], o[0] + o[1], 1.0]
    return 0.5 * ((cp[0] - co[0]) ** 2 + (cp[1] - co[1]) ** 2)


# --------------------------------------------------------------------------- #
# storage (mirrors mvp_schema.sql; SQLite for portability)
# --------------------------------------------------------------------------- #
SCHEMA = """
CREATE TABLE IF NOT EXISTS matches(
  match_id INTEGER PRIMARY KEY, competition TEXT, home TEXT, away TEXT,
  kickoff_at REAL, lock_at REAL,
  odds_open TEXT, odds_lock TEXT, odds_close TEXT,   -- json [H,D,A] decimal odds
  q_open TEXT, q_lock TEXT, q_close TEXT,            -- json no-vig probs
  odds_source TEXT, result TEXT, match_status TEXT DEFAULT 'SCHEDULED'
);
CREATE TABLE IF NOT EXISTS predictions(
  prediction_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL, slate_id INTEGER NOT NULL DEFAULT 1, match_id INTEGER NOT NULL,
  submitted_at REAL, locked_at REAL, revealed_at REAL,
  commitment_hash TEXT NOT NULL, salt_hex TEXT,
  p_h INTEGER, p_d INTEGER, p_a INTEGER,                      -- permille, set at reveal
  q_submit TEXT,                                             -- server-authoritative no-vig market
  reveal_flag INTEGER DEFAULT 0, valid_commit INTEGER DEFAULT 0,
  rps REAL, log_loss REAL, clv REAL, alpha_close REAL,
  UNIQUE(user_id, slate_id, match_id)
);
"""


@contextmanager
def db():
    con = sqlite3.connect(DB); con.row_factory = sqlite3.Row
    try:
        yield con; con.commit()
    finally:
        con.close()


def init_db():
    with db() as con:
        con.executescript(SCHEMA)
        # seed one open World-Cup fixture if empty (so the terminal has something to show)
        n = con.execute("SELECT COUNT(*) c FROM matches").fetchone()["c"]
        if n == 0:
            now = time.time()
            odds_open = [2.10, 3.30, 3.60]      # decimal; no-vig derived below
            con.execute(
                "INSERT INTO matches(match_id,competition,home,away,kickoff_at,lock_at,"
                "odds_open,q_open,match_status) VALUES(?,?,?,?,?,?,?,?,?)",
                (2026001, "FIFA WORLD CUP 2026 · GROUP A", "Mexico", "Poland",
                 now + 9.5 * 86400, now + 9.4 * 86400,
                 _json(odds_open), _json(no_vig(odds_open)), "SCHEDULED"))


def _json(x):
    import json; return json.dumps(x)


def _loads(s):
    import json; return json.loads(s) if s else None


# --------------------------------------------------------------------------- #
# API
# --------------------------------------------------------------------------- #
app = FastAPI(title="Proof of Foresight — MVP")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
init_db()


class CommitIn(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)
    match_id: int
    commitment_hash: str = Field(min_length=64, max_length=64)
    slate_id: int = 1


class RevealIn(BaseModel):
    user_id: str
    match_id: int
    p: conlist(float, min_length=3, max_length=3)   # raw H,D,A (any positive scale)
    salt_hex: str = Field(min_length=8, max_length=128)
    slate_id: int = 1


@app.get("/api/fixtures/next-open")
def next_open():
    """The next fixture still open for commitments (lock_at in the future)."""
    now = time.time()
    with db() as con:
        r = con.execute(
            "SELECT * FROM matches WHERE lock_at > ? AND match_status='SCHEDULED' "
            "ORDER BY kickoff_at ASC LIMIT 1", (now,)).fetchone()
    if not r:
        raise HTTPException(404, "no open fixture")
    return {"match_id": r["match_id"], "competition": r["competition"],
            "home": r["home"], "away": r["away"],
            "kickoff_at": int(r["kickoff_at"] * 1000), "lock_at": int(r["lock_at"] * 1000),
            "q_submit": _loads(r["q_open"])}     # current no-vig market (reference only)


@app.get("/api/fixtures/open")
def open_slate():
    """All fixtures still open for commitments — the current slate the user must predict in full."""
    now = time.time()
    with db() as con:
        rows = con.execute(
            "SELECT * FROM matches WHERE lock_at > ? AND match_status='SCHEDULED' "
            "ORDER BY kickoff_at ASC", (now,)).fetchall()
    return {"count": len(rows), "slate": [
        {"match_id": r["match_id"], "competition": r["competition"],
         "home": r["home"], "away": r["away"],
         "kickoff_at": int(r["kickoff_at"] * 1000), "lock_at": int(r["lock_at"] * 1000),
         "q_submit": _loads(r["q_open"])} for r in rows]}


@app.post("/api/predictions")
def commit(body: CommitIn):
    """Store a sealed commitment. Server snapshots q_submit AUTHORITATIVELY (ignores any
    client-claimed market) and refuses commitments after lock."""
    now = time.time()
    with db() as con:
        m = con.execute("SELECT * FROM matches WHERE match_id=?", (body.match_id,)).fetchone()
        if not m:
            raise HTTPException(404, "unknown match")
        if now >= m["lock_at"]:
            raise HTTPException(409, "match is locked; submissions closed")
        dup = con.execute(
            "SELECT 1 FROM predictions WHERE user_id=? AND slate_id=? AND match_id=?",
            (body.user_id, body.slate_id, body.match_id)).fetchone()
        if dup:
            raise HTTPException(409, "already committed for this match")
        q_submit = _loads(m["q_open"])           # AUTHORITATIVE snapshot at receipt time
        con.execute(
            "INSERT INTO predictions(user_id,slate_id,match_id,submitted_at,commitment_hash,q_submit)"
            " VALUES(?,?,?,?,?,?)",
            (body.user_id, body.slate_id, body.match_id, now, body.commitment_hash, _json(q_submit)))
        pid = con.execute("SELECT last_insert_rowid() id").fetchone()["id"]
    return {"ok": True, "prediction_id": pid, "q_submit": q_submit,
            "server_received_at": now, "status": "SEALED"}


@app.post("/api/predictions/reveal")
def reveal(body: RevealIn):
    """After lock, reveal the salt + distribution. Server recomputes the commitment with the
    EXACT canonical scheme and accepts only on a byte-for-byte hash match."""
    now = time.time()
    with db() as con:
        row = con.execute(
            "SELECT p.*, m.lock_at, m.result, m.q_close FROM predictions p JOIN matches m"
            " ON m.match_id=p.match_id WHERE p.user_id=? AND p.slate_id=? AND p.match_id=?",
            (body.user_id, body.slate_id, body.match_id)).fetchone()
        if not row:
            raise HTTPException(404, "no committed prediction")
        if now < row["lock_at"]:
            raise HTTPException(409, "cannot reveal before lock")
        if row["reveal_flag"] and row["valid_commit"]:
            raise HTTPException(409, "already revealed; a fulfilled commitment is immutable")
        perm = quantize_permille(*body.p)
        recomputed = commitment(body.match_id, perm, body.salt_hex)
        valid = (recomputed == row["commitment_hash"])
        if not valid:
            # a failed/tampered reveal must NEVER mutate a prediction row; verify-only.
            raise HTTPException(400, {"ok": False, "reason": "commitment mismatch — reveal rejected",
                                      "recomputed": recomputed, "committed": row["commitment_hash"]})
        rps = log_loss = None
        if row["result"] in ("H", "D", "A"):
            yi = {"H": 0, "D": 1, "A": 2}[row["result"]]
            p = [perm[0] / 1000, perm[1] / 1000, perm[2] / 1000]
            rps = rps_ordinal(p, yi)
            log_loss = -math.log(max(p[yi], 1e-6))
        con.execute(
            "UPDATE predictions SET reveal_flag=1, valid_commit=1, revealed_at=?, salt_hex=?,"
            " p_h=?, p_d=?, p_a=?, rps=?, log_loss=? WHERE prediction_id=?",
            (now, body.salt_hex, perm[0], perm[1], perm[2], rps, log_loss, row["prediction_id"]))
    return {"ok": True, "valid_commit": True, "permille": perm, "rps": rps, "log_loss": log_loss}


@app.get("/api/predictions")
def list_preds(user_id: Optional[str] = None, match_id: Optional[int] = None):
    # Additive read: also surface the server-authoritative scores (clv, alpha_close — filled
    # by ingestion at settle) and the match-join display fields (teams, result, closing line)
    # so the frontend can show CLV/results WITHOUT re-scoring on the client. The bare column
    # names (p_h, valid_commit, rps, …) are unchanged, so existing consumers/tests still work.
    q = "SELECT p.prediction_id,p.user_id,p.match_id,p.submitted_at,p.revealed_at," \
        "p.commitment_hash,p.reveal_flag,p.valid_commit,p.p_h,p.p_d,p.p_a,p.q_submit," \
        "p.rps,p.log_loss,p.clv,p.alpha_close," \
        "m.competition,m.home,m.away,m.result,m.q_close" \
        " FROM predictions p JOIN matches m ON m.match_id=p.match_id WHERE 1=1"
    args = []
    if user_id:
        q += " AND p.user_id=?"; args.append(user_id)
    if match_id:
        q += " AND p.match_id=?"; args.append(match_id)
    q += " ORDER BY p.prediction_id DESC LIMIT 200"
    with db() as con:
        rows = [dict(r) for r in con.execute(q, args).fetchall()]
    return {"count": len(rows), "predictions": rows}


@app.get("/api/leaderboard")
def leaderboard(slate_id: int = 1):
    """Absolute-skill leaderboard with WORST-CASE scoring for committed-but-unrevealed
    predictions (selective non-reveal cannot dodge a bad call)."""
    with db() as con:
        rows = con.execute(
            "SELECT p.user_id, p.reveal_flag, p.valid_commit, p.rps, p.log_loss"
            " FROM predictions p JOIN matches m ON m.match_id=p.match_id"
            " WHERE p.slate_id=? AND m.match_status='FINAL'", (slate_id,)).fetchall()
    agg = {}
    for r in rows:
        u = agg.setdefault(r["user_id"], {"n": 0, "rps": 0.0, "ll": 0.0, "revealed": 0})
        u["n"] += 1
        if r["reveal_flag"] and r["valid_commit"]:
            u["revealed"] += 1; u["rps"] += r["rps"] or RPS_MAX; u["ll"] += r["log_loss"] or LOGLOSS_MAX
        else:
            u["rps"] += RPS_MAX; u["ll"] += LOGLOSS_MAX        # worst-case
    board = []
    for u, v in agg.items():
        board.append({"user_id": u, "n": v["n"],
                      "mean_rps": round(v["rps"] / v["n"], 4),
                      "mean_log_loss": round(v["ll"] / v["n"], 4),
                      "reveal_reliability": round(v["revealed"] / v["n"], 3)})
    board.sort(key=lambda x: x["mean_rps"])
    return {"slate_id": slate_id, "leaderboard": board}


@app.get("/")
def root():
    return {"service": "Proof of Foresight MVP", "scheme": SCHEME,
            "endpoints": ["/api/fixtures/next-open", "POST /api/predictions",
                          "POST /api/predictions/reveal", "/api/predictions", "/api/leaderboard"]}
