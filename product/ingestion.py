"""
Proof of Foresight — Step 3: fixtures + three-snapshot odds ingestion pipeline.

Feeds q_open / q_lock / q_close into the SAME store the MVP backend uses
(pof_mvp.db, schema mirrors mvp_schema.sql). The pipeline is NOT hardwired to any
paid odds API: it talks to an abstract OddsSource. Two implementations ship here:

  * ReplaySource  — drives the whole lifecycle from REAL historical football-data
                    CSVs (works today, no API key); used to validate the pipeline and
                    to study lock_at (Step 1).
  * LiveSource    — adapter skeleton for a real provider (the-odds-api / Pinnacle).
                    Fill _fetch(); the lifecycle logic is identical.

The core is a LIFECYCLE SCHEDULER, not just a fetcher. q_open and q_close exist in
history, but q_lock is the market AT lock_at and must be captured by the scheduler at
that instant. Three transitions per match:
    register   : create fixture + q_open at slate open
    lock_tick  : at lock_at, snapshot q_lock and freeze submissions
    settle_tick: after kickoff, snapshot q_close + result, score revealed predictions

Run (replay over your real EPL CSVs, compressed clock):
    python ingestion.py --replay real_data --db pof_mvp.db --speed 0
"""
from __future__ import annotations
import argparse, glob, json, math, os, sqlite3, sys, time
from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd

# Make phase0 importable whether this file sits in a flat dir alongside phase0.py
# or in the handoff layout (product/ here, phase0 in ../research/).
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "research"))

# reuse audited primitives from phase0 (column detection, no-vig) so ingestion and
# scoring share ONE de-vig implementation
from phase0 import load_football_data, no_vig as _novig_vec

SCHEME = "PoF|v1"
RES_IX = {"H": 0, "D": 1, "A": 2}


# --------------------------------------------------------------------------- #
# storage helpers (same DB/shape as pof_backend.py)
# --------------------------------------------------------------------------- #
SCHEMA = """
CREATE TABLE IF NOT EXISTS matches(
  match_id INTEGER PRIMARY KEY, competition TEXT, home TEXT, away TEXT,
  kickoff_at REAL, lock_at REAL,
  odds_open TEXT, odds_lock TEXT, odds_close TEXT,
  q_open TEXT, q_lock TEXT, q_close TEXT,
  odds_source TEXT, result TEXT, match_status TEXT DEFAULT 'SCHEDULED'
);
CREATE TABLE IF NOT EXISTS predictions(
  prediction_id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL, slate_id INTEGER NOT NULL DEFAULT 1, match_id INTEGER NOT NULL,
  submitted_at REAL, locked_at REAL, revealed_at REAL,
  commitment_hash TEXT NOT NULL, salt_hex TEXT,
  p_h INTEGER, p_d INTEGER, p_a INTEGER, q_submit TEXT,
  reveal_flag INTEGER DEFAULT 0, valid_commit INTEGER DEFAULT 0,
  rps REAL, log_loss REAL, clv REAL, alpha_close REAL,
  UNIQUE(user_id, slate_id, match_id)
);
CREATE TABLE IF NOT EXISTS ingestion_log(
  ts REAL, match_id INTEGER, event TEXT, detail TEXT
);
"""


def connect(db):
    con = sqlite3.connect(db); con.row_factory = sqlite3.Row
    con.executescript(SCHEMA)
    return con


def log(con, match_id, event, detail=""):
    con.execute("INSERT INTO ingestion_log(ts,match_id,event,detail) VALUES(?,?,?,?)",
                (time.time(), match_id, event, detail))


def rps_ordinal(p, yi):
    o = [0, 0, 0]; o[yi] = 1
    cp = [p[0], p[0] + p[1], 1.0]; co = [o[0], o[0] + o[1], 1.0]
    return 0.5 * ((cp[0] - co[0]) ** 2 + (cp[1] - co[1]) ** 2)


def cross_entropy(qref, p):
    return -sum(qref[i] * math.log(max(p[i], 1e-6)) for i in range(3))


# --------------------------------------------------------------------------- #
# abstract odds source
# --------------------------------------------------------------------------- #
@dataclass
class Fixture:
    match_id: int
    competition: str
    home: str
    away: str
    kickoff_at: float
    lock_at: float
    odds_open: list           # decimal [H,D,A]
    source: str


class OddsSource:
    """Interface every provider implements. The scheduler only ever calls these."""
    def upcoming_fixtures(self) -> list[Fixture]:
        raise NotImplementedError
    def odds_at(self, match_id: int, when: str) -> Optional[list]:
        """Decimal [H,D,A] snapshot. when in {'lock','close'}. None if unavailable."""
        raise NotImplementedError
    def result_of(self, match_id: int) -> Optional[str]:
        """'H'/'D'/'A' once final, else None."""
        raise NotImplementedError


# --------------------------------------------------------------------------- #
# ReplaySource — real historical CSVs drive the full lifecycle (no API key)
# --------------------------------------------------------------------------- #
class ReplaySource(OddsSource):
    """Each historical match becomes a fixture whose open/lock/close odds come from real
    columns. We map: q_open = early Pinnacle (PSH/PSD/PSA); q_close = closing Pinnacle
    (PSCH/PSCD/PSCA); q_lock = a snapshot BETWEEN them on the clr-path (a faithful stand-in
    for "the market at lock", since history has no separately-timestamped lock line)."""
    def __init__(self, datadir, lock_frac=0.85, max_matches=40):
        d, _ = load_football_data(sorted(glob.glob(os.path.join(datadir, "*.csv"))))
        self.df = d.tail(max_matches).reset_index(drop=True)
        self.lock_frac = lock_frac
        self._results = {}

    def _open(self, r):
        return [float(r.open_H), float(r.open_D), float(r.open_A)]

    def _close(self, r):
        return [float(r.close_H), float(r.close_D), float(r.close_A)]

    def upcoming_fixtures(self):
        out = []
        base = time.time()
        for i, r in enumerate(self.df.itertuples(index=False)):
            ko = base + 60 + i * 6            # compressed: kickoffs seconds apart
            out.append(Fixture(match_id=100000 + i,
                               competition="REPLAY · EPL (real odds)",
                               home=r.home, away=r.away,
                               kickoff_at=ko, lock_at=ko - 3,   # lock 3s before kickoff
                               odds_open=self._open(r), source="football-data:PS/PSC"))
            self._results[100000 + i] = r.ftr
        return out

    def odds_at(self, match_id, when):
        i = match_id - 100000; r = self.df.iloc[i]
        if when == "close":
            return self._close(r)
        if when == "lock":
            # clr-path point between open and close at lock_frac (faithful intermediate)
            qo = np.array(_novig_vec(np.array([self._open(r)]))[0])
            qc = np.array(_novig_vec(np.array([self._close(r)]))[0])
            zo, zc = np.log(qo) - np.log(qo).mean(), np.log(qc) - np.log(qc).mean()
            zt = (1 - self.lock_frac) * zo + self.lock_frac * zc
            q = np.exp(zt) / np.exp(zt).sum()
            return list(1.0 / q)              # back to decimal-ish odds (no vig)
        return None

    def result_of(self, match_id):
        return self._results.get(match_id)


# --------------------------------------------------------------------------- #
# LiveSource — real provider adapter skeleton (fill _fetch)
# --------------------------------------------------------------------------- #
class LiveSource(OddsSource):
    """Wire a real provider here. Only _fetch needs implementing; the scheduler logic is
    unchanged. Recommended providers expose 1X2 (h2h) decimal odds per bookmaker; pick
    Pinnacle when present (sharp, low-vig) and record which book was used."""
    def __init__(self, api_key=None, base_url="", competition="FIFA WORLD CUP 2026"):
        self.api_key = api_key or os.environ.get("ODDS_API_KEY")
        self.base_url = base_url
        self.competition = competition

    def _fetch(self, path, params=None):
        raise NotImplementedError(
            "Implement with your provider, e.g. the-odds-api:\n"
            "  GET {base}/v4/sports/soccer_fifa_world_cup/odds?regions=eu&markets=h2h"
            "&oddsFormat=decimal&apiKey={key}\n"
            "Parse each event -> Fixture(odds_open = Pinnacle h2h [H,D,A]); for odds_at('lock'|"
            "'close') re-query near lock_at / after kickoff and read the same book.")

    def upcoming_fixtures(self):
        raise NotImplementedError("LiveSource.upcoming_fixtures: parse self._fetch(...) into Fixtures")

    def odds_at(self, match_id, when):
        raise NotImplementedError("LiveSource.odds_at: re-query the provider near lock/close")

    def result_of(self, match_id):
        raise NotImplementedError("LiveSource.result_of: read provider scores endpoint")


# --------------------------------------------------------------------------- #
# lifecycle scheduler
# --------------------------------------------------------------------------- #
class Pipeline:
    def __init__(self, src: OddsSource, db="pof_mvp.db"):
        self.src = src; self.con = connect(db)

    def register(self):
        """Create fixtures + q_open at slate open (idempotent)."""
        n = 0
        for fx in self.src.upcoming_fixtures():
            exists = self.con.execute("SELECT 1 FROM matches WHERE match_id=?", (fx.match_id,)).fetchone()
            if exists:
                continue
            qo = _novig_vec(np.array([fx.odds_open]))[0].tolist()
            self.con.execute(
                "INSERT INTO matches(match_id,competition,home,away,kickoff_at,lock_at,"
                "odds_open,q_open,odds_source,match_status) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (fx.match_id, fx.competition, fx.home, fx.away, fx.kickoff_at, fx.lock_at,
                 json.dumps(fx.odds_open), json.dumps(qo), fx.source, "SCHEDULED"))
            log(self.con, fx.match_id, "register", f"q_open={[round(x,3) for x in qo]}")
            n += 1
        self.con.commit(); return n

    def lock_tick(self, now=None):
        """At/after lock_at: snapshot q_lock and freeze (SCHEDULED -> LOCKED)."""
        now = now or time.time(); n = 0
        rows = self.con.execute(
            "SELECT match_id FROM matches WHERE match_status='SCHEDULED' AND lock_at<=?", (now,)).fetchall()
        for r in rows:
            mid = r["match_id"]; o = self.src.odds_at(mid, "lock")
            ql = _novig_vec(np.array([o]))[0].tolist() if o else None
            self.con.execute("UPDATE matches SET odds_lock=?, q_lock=?, match_status='LOCKED' WHERE match_id=?",
                             (json.dumps(o) if o else None, json.dumps(ql) if ql else None, mid))
            log(self.con, mid, "lock", f"q_lock={[round(x,3) for x in ql] if ql else None}")
            n += 1
        self.con.commit(); return n

    def settle_tick(self, now=None):
        """After kickoff: snapshot q_close + result, score revealed predictions, mark FINAL."""
        now = now or time.time(); n = 0
        rows = self.con.execute(
            "SELECT match_id FROM matches WHERE match_status='LOCKED' AND kickoff_at<=?", (now,)).fetchall()
        for r in rows:
            mid = r["match_id"]
            res = self.src.result_of(mid)
            if res not in ("H", "D", "A"):
                continue                       # result not in yet; try next tick
            oc = self.src.odds_at(mid, "close")
            qc = _novig_vec(np.array([oc]))[0].tolist() if oc else None
            self.con.execute(
                "UPDATE matches SET odds_close=?, q_close=?, result=?, match_status='FINAL' WHERE match_id=?",
                (json.dumps(oc) if oc else None, json.dumps(qc) if qc else None, res, mid))
            log(self.con, mid, "settle", f"result={res} q_close={[round(x,3) for x in qc] if qc else None}")
            self._score_match(mid, res, qc)
            n += 1
        self.con.commit(); return n

    def _score_match(self, mid, res, q_close):
        """Score every revealed+valid prediction for this match: RPS, log-loss, CLV vs submit,
        realized alpha vs close. Mirrors the Phase-1 metric definitions."""
        yi = RES_IX[res]
        preds = self.con.execute(
            "SELECT prediction_id,p_h,p_d,p_a,q_submit FROM predictions"
            " WHERE match_id=? AND reveal_flag=1 AND valid_commit=1", (mid,)).fetchall()
        for p in preds:
            if p["p_h"] is None:
                continue
            pv = [p["p_h"] / 1000, p["p_d"] / 1000, p["p_a"] / 1000]
            rps = rps_ordinal(pv, yi); ll = -math.log(max(pv[yi], 1e-6))
            clv = alpha = None
            if q_close:
                qs = json.loads(p["q_submit"]) if p["q_submit"] else None
                if qs:
                    clv = cross_entropy(q_close, qs) - cross_entropy(q_close, pv)   # excess CLV vs submit
                qc_rps = rps_ordinal(q_close, yi)
                alpha = qc_rps - rps                                                # realized alpha vs close
            self.con.execute("UPDATE predictions SET rps=?, log_loss=?, clv=?, alpha_close=? WHERE prediction_id=?",
                             (rps, ll, clv, alpha, p["prediction_id"]))

    # ---- driver ----
    def run(self, speed=0.0, max_seconds=120, virtual=True):
        """Drive register -> repeated lock/settle ticks until all matches FINAL.
        virtual=True (replay): advance a VIRTUAL clock straight to the next lock/kickoff
        event instead of sleeping on the wall clock, so every match completes deterministically.
        virtual=False (live daemon): tick on the real clock with `speed` seconds between passes."""
        created = self.register()
        print(f"registered {created} fixtures")
        if virtual:
            vnow = self.con.execute("SELECT MIN(lock_at) m FROM matches").fetchone()["m"] or time.time()
            while True:
                locked = self.lock_tick(now=vnow); settled = self.settle_tick(now=vnow)
                if locked or settled:
                    pend = self.con.execute("SELECT COUNT(*) c FROM matches WHERE match_status!='FINAL'").fetchone()["c"]
                    print(f"  vclock {vnow:.0f}: +{locked} locked, +{settled} settled, {pend} pending")
                if self.con.execute("SELECT COUNT(*) c FROM matches WHERE match_status!='FINAL'").fetchone()["c"] == 0:
                    print("all matches FINAL"); break
                # jump to the next scheduled event time
                nxt = self.con.execute(
                    "SELECT MIN(t) m FROM (SELECT lock_at t FROM matches WHERE match_status='SCHEDULED'"
                    " UNION ALL SELECT kickoff_at t FROM matches WHERE match_status='LOCKED')").fetchone()["m"]
                if nxt is None:
                    break
                vnow = max(nxt, vnow) + 0.001
            return
        t0 = time.time()
        while True:
            locked = self.lock_tick(); settled = self.settle_tick()
            pending = self.con.execute(
                "SELECT COUNT(*) c FROM matches WHERE match_status!='FINAL'").fetchone()["c"]
            if locked or settled:
                print(f"  tick: +{locked} locked, +{settled} settled, {pending} pending")
            if pending == 0:
                print("all matches FINAL"); break
            if time.time() - t0 > max_seconds:
                print(f"stopping after {max_seconds}s ({pending} still pending)"); break
            time.sleep(speed if speed > 0 else 0.4)

    def summary(self):
        m = self.con.execute(
            "SELECT match_status, COUNT(*) c FROM matches GROUP BY match_status").fetchall()
        print("match status:", {r["match_status"]: r["c"] for r in m})
        snaps = self.con.execute(
            "SELECT SUM(q_open IS NOT NULL) o, SUM(q_lock IS NOT NULL) l, SUM(q_close IS NOT NULL) c "
            "FROM matches").fetchone()
        print(f"snapshots present: q_open={snaps['o']}  q_lock={snaps['l']}  q_close={snaps['c']}")
        scored = self.con.execute("SELECT COUNT(*) c FROM predictions WHERE rps IS NOT NULL").fetchone()["c"]
        print(f"scored predictions: {scored}")


def main():
    ap = argparse.ArgumentParser(description="PoF Step 3 — fixtures & three-snapshot odds ingestion")
    ap.add_argument("--replay", metavar="DATADIR", help="drive lifecycle from real historical CSVs")
    ap.add_argument("--db", default="pof_mvp.db")
    ap.add_argument("--speed", type=float, default=0.0, help="seconds between ticks (0=fast)")
    ap.add_argument("--max-matches", type=int, default=40)
    a = ap.parse_args()
    if not a.replay:
        print("LiveSource requires a provider key + adapter (_fetch). Use --replay <dir> to "
              "validate the pipeline on real historical odds now.")
        return
    src = ReplaySource(a.replay, max_matches=a.max_matches)
    pipe = Pipeline(src, a.db)
    pipe.run(speed=a.speed)
    pipe.summary()


if __name__ == "__main__":
    main()
