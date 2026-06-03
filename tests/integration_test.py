"""Step2 + Step3 integration: the ingestion pipeline and the MVP backend share ONE db.
A real user's committed+revealed prediction is AUTO-SCORED when the pipeline settles."""
import os, sys, time, json, sqlite3
# resolve modules whether flat or in the handoff layout (tests/ here; product/ & research/ alongside)
_here = os.path.dirname(os.path.abspath(__file__))
for _p in (_here, os.path.join(_here, "..", "product"), os.path.join(_here, "..", "research")):
    sys.path.insert(0, _p)
os.environ["POF_DB"] = "integ.db"
import ingestion as ING
from ingestion import ReplaySource, Pipeline
from phase0 import load_football_data
import pof_backend as B
from fastapi.testclient import TestClient
from pof_backend import quantize_permille, commitment

# 1) ingestion registers fixtures + q_open into integ.db
src = ReplaySource("real_data", max_matches=6)
pipe = Pipeline(src, "integ.db")
n = pipe.register()
print(f"1) pipeline registered {n} fixtures (q_open filled)")

# point the backend at the same DB (re-init binds B.DB)
B.DB = "integ.db"
c = TestClient(B.app)

# 2) backend serves the first open fixture; a user commits
fx = c.get("/api/fixtures/next-open").json()
mid = fx["match_id"]
print(f"2) backend open fixture #{mid}: {fx['home']} vs {fx['away']}  q_submit={[round(x,3) for x in fx['q_submit']]}")

pa = [0.50, 0.27, 0.23]; perm = quantize_permille(*pa); salt = "5c"*32
h = commitment(mid, perm, salt)
r = c.post("/api/predictions", json={"user_id":"carla","match_id":mid,"commitment_hash":h})
print("   commit:", r.status_code, r.json().get("status"), "server q_submit snapshot ✓")

# 3) advance virtual clock to this match's lock -> pipeline snapshots q_lock + freezes
# (replay uses a virtual clock; for the backend's wall-clock reveal gate we also move this
#  fixture's lock_at/kickoff into the past so "lock has passed" holds for the API too)
import sqlite3 as _sq
with _sq.connect("integ.db") as con:
    now = time.time()
    con.execute("UPDATE matches SET lock_at=?, kickoff_at=? WHERE match_id=?",
                (now - 60, now - 30, mid)); con.commit()
    lk = con.execute("SELECT lock_at,kickoff_at FROM matches WHERE match_id=?", (mid,)).fetchone()
locked = pipe.lock_tick(now=lk[0]+0.001)
print(f"3) pipeline lock_tick at lock_at: +{locked} locked (q_lock snapshotted)")

# 4) user reveals after lock
rev = c.post("/api/predictions/reveal", json={"user_id":"carla","match_id":mid,"p":pa,"salt_hex":salt})
print("4) reveal:", rev.status_code, "valid_commit", rev.json().get("valid_commit"))

# 5) pipeline settles this match -> q_close + result + AUTO-SCORE (rps/clv/alpha)
settled = pipe.settle_tick(now=lk[1]+0.001)
print(f"5) pipeline settle_tick after kickoff: +{settled} settled (q_close + result + scoring)")

# 6) inspect the auto-scored prediction + the three snapshots
with sqlite3.connect("integ.db") as con:
    con.row_factory = sqlite3.Row
    m = con.execute("SELECT result,q_open,q_lock,q_close FROM matches WHERE match_id=?", (mid,)).fetchone()
    p = con.execute("SELECT reveal_flag,valid_commit,rps,log_loss,clv,alpha_close,q_submit"
                    " FROM predictions WHERE user_id='carla' AND match_id=?", (mid,)).fetchone()
print(f"6) match result={m['result']}")
print(f"   q_open ={[round(x,3) for x in json.loads(m['q_open'])]}")
print(f"   q_lock ={[round(x,3) for x in json.loads(m['q_lock'])]}")
print(f"   q_close={[round(x,3) for x in json.loads(m['q_close'])]}")
print(f"   carla scored: rps={p['rps']:.4f}  log_loss={p['log_loss']:.4f}  "
      f"clv_vs_submit={p['clv']:+.4f}  alpha_vs_close={p['alpha_close']:+.4f}")

assert p["rps"] is not None and p["clv"] is not None and p["alpha_close"] is not None, "auto-scoring failed"
assert m["q_open"] and m["q_lock"] and m["q_close"], "missing a snapshot"
print("\nINTEGRATION OK ✓  — pipeline three-snapshot ingest + backend commit/reveal + auto-scoring all wired")
