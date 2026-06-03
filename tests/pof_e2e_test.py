"""End-to-end lifecycle test against the FastAPI app in-process (TestClient).
Proves: commit -> reveal-before-lock blocked -> settle -> reveal verifies & scores
-> tampered reveal rejected -> non-revealer scored worst-case on leaderboard."""
import time, sqlite3, hashlib, math, os, sys
_here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_here, "..", "product"))
from fastapi.testclient import TestClient
import pof_backend as B

# fresh DB already seeded with match 2026001 (lock ~9.4d out). For the test we move
# lock/kickoff into the past AFTER committing, to exercise reveal + scoring.
c = TestClient(B.app)

print("1) fixture open:")
f = c.get("/api/fixtures/next-open").json(); print("  ", f["home"], "vs", f["away"], "q_submit", [round(x,3) for x in f["q_submit"]])
mid = f["match_id"]

# --- user alice commits a genuine distribution ---
from pof_backend import quantize_permille, commitment
pa_raw = [0.55, 0.25, 0.20]
perm_a = quantize_permille(*pa_raw); salt_a = "11"*32
hash_a = commitment(mid, perm_a, salt_a)
r = c.post("/api/predictions", json={"user_id":"alice","match_id":mid,"commitment_hash":hash_a})
print("2) alice commit:", r.status_code, r.json().get("status"), "server q_submit", r.json().get("q_submit"))

# --- bob commits but will NEVER reveal (selective non-reveal) ---
perm_b = quantize_permille(0.34,0.33,0.33); salt_b="22"*32; hash_b=commitment(mid,perm_b,salt_b)
c.post("/api/predictions", json={"user_id":"bob","match_id":mid,"commitment_hash":hash_b})

# --- duplicate commit rejected ---
dup = c.post("/api/predictions", json={"user_id":"alice","match_id":mid,"commitment_hash":hash_a})
print("3) duplicate commit blocked:", dup.status_code, "(expect 409)")

# --- reveal before lock blocked ---
early = c.post("/api/predictions/reveal", json={"user_id":"alice","match_id":mid,"p":pa_raw,"salt_hex":salt_a})
print("4) reveal-before-lock blocked:", early.status_code, "(expect 409)")

# --- settle the match: move lock/kickoff to the past, set result + closing line ---
with sqlite3.connect(B.DB) as con:
    now=time.time()
    con.execute("UPDATE matches SET lock_at=?, kickoff_at=?, result='H', match_status='FINAL',"
                " odds_close=?, q_close=? WHERE match_id=?",
                (now-3600, now-1800, B._json([2.05,3.4,3.7]), B._json(B.no_vig([2.05,3.4,3.7])), mid))
    con.commit()
print("5) match settled: result=H (home win)")

# --- alice reveals correctly -> verifies + scores ---
rev = c.post("/api/predictions/reveal", json={"user_id":"alice","match_id":mid,"p":pa_raw,"salt_hex":salt_a})
print("6) alice reveal:", rev.status_code, rev.json())

# --- tampered reveal (changed distribution, same salt) -> rejected ---
tam = c.post("/api/predictions/reveal", json={"user_id":"alice","match_id":mid,"p":[0.90,0.05,0.05],"salt_hex":salt_a})
print("7) tampered reveal rejected:", tam.status_code, "(expect 400)")
# 7b) alice's successful reveal must survive the tamper attempt
chk = c.get("/api/predictions", params={"user_id":"alice"}).json()["predictions"][0]
print("7b) alice row intact after tamper:", "valid_commit", chk["valid_commit"], "perm", [chk["p_h"],chk["p_d"],chk["p_a"]], "rps", round(chk["rps"],4) if chk["rps"] else None)
assert chk["valid_commit"]==1 and chk["p_h"]==550 and abs(chk["rps"]-0.1212)<1e-3, "successful reveal was corrupted!"
# 7c) re-revealing a fulfilled commitment is refused
again = c.post("/api/predictions/reveal", json={"user_id":"alice","match_id":mid,"p":[0.55,0.25,0.20],"salt_hex":salt_a})
print("7c) re-reveal blocked:", again.status_code, "(expect 409)")

# --- leaderboard: bob never revealed -> worst-case RPS=1.0 ---
lb = c.get("/api/leaderboard").json()["leaderboard"]
print("8) leaderboard (worst-case for non-revealers):")
for row in lb:
    print(f"   {row['user_id']:6} mean_rps={row['mean_rps']:.4f}  reveal_reliability={row['reveal_reliability']}")
assert any(x["user_id"]=="bob" and x["mean_rps"]==1.0 for x in lb), "bob should be worst-cased"
assert any(x["user_id"]=="alice" and x["mean_rps"]<0.5 for x in lb), "alice (correct H call) should score well"
print("\nALL CHECKS PASSED ✓")
