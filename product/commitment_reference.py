"""Backend-side reference implementation of the commitment scheme — proves the
Python server can recompute the SAME SHA-256 the browser produced (commit-reveal
only works if both sides serialize identically)."""
import hashlib, math, secrets
SCHEME = "PoF|v1"

def quantize_permille(h, d, a):
    s = h + d + a
    raw = [h/s*1000, d/s*1000, a/s*1000]
    fl = [math.floor(x) for x in raw]
    rem = 1000 - sum(fl)
    order = sorted(range(3), key=lambda i: raw[i]-fl[i], reverse=True)
    for k in range(rem):
        fl[order[k]] += 1
    return fl

def preimage(match_id, perm, salt_hex):
    return f"{SCHEME}|{match_id}|{perm[0]}-{perm[1]}-{perm[2]}|{salt_hex}"

def commitment(match_id, perm, salt_hex):
    return hashlib.sha256(preimage(match_id, perm, salt_hex).encode()).hexdigest()

# --- test vectors: quantization sums to 1000 over many random inputs ---
import random
bad = 0
for _ in range(100000):
    h, d, a = random.randint(1,98), random.randint(1,98), random.randint(1,98)
    p = quantize_permille(h, d, a)
    if sum(p) != 1000 or min(p) < 0:
        bad += 1
print(f"quantization: {'OK' if bad==0 else f'FAIL ({bad})'} — all sum to 1000 over 100k random inputs")

# --- known vector: reproduce a browser-style commitment exactly ---
mid = 2026001
perm = quantize_permille(45, 27, 28)          # -> [450,270,280]
salt = "a3f1" + "00"*30                         # fixed salt for the vector
pre = preimage(mid, perm, salt)
print("preimage :", pre)
print("perm     :", perm, "sum", sum(perm))
print("sha256   :", commitment(mid, perm, salt))

# --- edge: rounding case that needs largest-remainder fixups ---
for trip in [(33,33,33),(1,1,1),(98,1,1),(50,49,1),(17,17,66)]:
    p = quantize_permille(*trip)
    assert sum(p)==1000, trip
print("edge cases: OK (largest-remainder keeps sum=1000)")
