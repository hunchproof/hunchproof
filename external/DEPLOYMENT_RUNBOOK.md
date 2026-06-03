# Proof of Foresight — Build & Deployment Runbook

An auditable **market-residual intelligence engine** for football: users commit a sealed
probability distribution before kickoff; it is scored by a strictly-proper rule against the
market's **closing line**; genuine, auditable information beyond the line accrues to a crowd oracle.

This repo is the complete, tested foundation produced in Phases 0–1. Everything here runs on
real historical odds today; going live needs only an odds-API key and real users.

---

## 0. What's proven vs. what's not (read first)

- **Proven on REAL data** (6 EPL seasons, 2,110 matches, Pinnacle open+close):
  the closing line is a hard, well-calibrated bar (RPS 0.195); the line moves on information
  (closing beats opening, z=3.24); a competent out-of-sample public model loses to the line;
  CLV is the statistically correct primary metric; the commit→lock→reveal→score pipeline runs
  end-to-end; the latency-arbitrage defense holds as a mathematical identity.
- **Validated with a SYNTHETIC crowd** (Phase-1 harness): the scoring and anti-gaming defense
  are correct. The "informed" users were given information by construction — this validates the
  **ruler**, not real-world alpha.
- **NOT yet claimed**: that a real crowd has edge. The one open question — *does a committed crowd
  produce positive pre-lock CLV?* — is answerable only with real users, in the live shadow contest.

Keep this discipline in every external doc. The one-pager (`PoF_onepager.html`) already does.

---

## 1. Repository map

### Measurement & evidence (research layer)
| File | What it does | Provenance |
|---|---|---|
| `phase0.py` | Closing-line bar: ingests football-data CSVs, no-vig, RPS/log-loss, line efficiency, CLV vs realized-alpha, 4 acceptance gates. | REAL odds |
| `phase0_REAL_report.{md,png}` | The real 6-season result (all four gates PASS). | REAL |
| `phase1.py` | Shadow-contest scoring harness: excess-CLV-vs-submit, latency-arb defense (copycat≡0), equal-weight-vs-robust oracle, P1–P4 gates. | REAL odds + SYNTHETIC crowd |
| `lock_scan.py` + report | Sites `lock_at` from real odds (headroom × benchmark-hardness); band ≈ 0.16–0.45. | REAL odds |
| `engine.py`, `simulate.py`, `simulate_alpha.py` | Mechanism library + the original mechanism-validation sims (now a regression suite). | SYNTHETIC |

### Product (runtime layer)
| File | What it does |
|---|---|
| `predict_terminal.html` | The user-facing commit-only terminal (sliders → SHA-256 commit → sealed receipt). Set `API_BASE` to go live. |
| `pof_backend.py` | FastAPI + SQLite: `/fixtures/next-open`, `/predictions` (commit), `/predictions/reveal`, `/leaderboard`. |
| `commitment_reference.py` | Canonical commitment scheme, proven byte-identical to the browser. |
| `ingestion.py` | Fixtures + three-snapshot odds pipeline (q_open/q_lock/q_close); lifecycle scheduler; auto-scoring on settle. |
| `live_odds_source.py` | Concrete The-Odds-API adapter (drop in a key). |
| `mvp_schema.sql` | Normalized Postgres schema (the production target; SQLite mirrors it for dev). |

### Tests
| File | Proves |
|---|---|
| `pof_e2e_test.py` | Full lifecycle + the reveal-immutability fix (tampered reveal can't corrupt a valid one). |
| `integration_test.py` | Pipeline + backend share one DB; a real prediction is auto-scored on settle. |

### External
| File | What it does |
|---|---|
| `PoF_onepager.html` | Investor/partner technical brief (every number sourced from the real reports). |

---

## 2. Environment

```bash
python -m venv venv && source venv/bin/activate
pip install numpy pandas scipy matplotlib fastapi "uvicorn[standard]" --break-system-packages
# optional, for the one-pager screenshot: pip install playwright && python -m playwright install chromium
```

Python 3.11+. Dev storage is SQLite (`pof_mvp.db`); production target is Postgres via `mvp_schema.sql`
(table shapes are identical, so the backend/ingestion code ports unchanged).

---

## 3. Reproduce the evidence (real data)

```bash
# put football-data.co.uk CSVs (E0.csv etc.) in real_data/ — Pinnacle PSH/PSD/PSA + PSCH/PSCD/PSCA
python phase0.py  --datadir real_data --outdir outputs_real      # the closing-line bar + 4 gates
python phase1.py  --datadir real_data --outdir outputs_phase1    # CLV defense + robust oracle
python lock_scan.py --datadir real_data --outdir outputs_lockscan # where to lock submissions
```

Sanity: `phase0` should show all four gates PASS, closing RPS ≈ 0.195, public model losing to the line.

---

## 4. Run the product locally (end-to-end, no key needed)

```bash
# 1) seed fixtures + q_open from real historical odds into the shared DB
python ingestion.py --replay real_data --db pof_mvp.db --max-matches 20

# 2) start the backend against that DB
POF_DB=pof_mvp.db uvicorn pof_backend:app --reload --port 8000

# 3) open the terminal; set API_BASE = "http://localhost:8000" near the top of predict_terminal.html
#    commit a prediction in the browser → it lands in pof_mvp.db (q_submit snapshotted server-side)

# 4) verify the whole loop + the security properties
python pof_e2e_test.py          # lifecycle, worst-case non-reveal, tamper rejection
python integration_test.py      # pipeline + backend + auto-scoring on one DB
```

---

## 5. Go live (World Cup 2026) — the only steps left

1. **Odds key.** Get a paid The-Odds-API key (soccer tiers). `export ODDS_API_KEY=...`.
   Confirm the World-Cup `sport_key` via `GET /v4/sports` (likely `soccer_fifa_world_cup`) and
   confirm field names with one live call (`live_odds_source.py`'s parser is defensive).
2. **Swap the source.** Replace `ReplaySource` with `TheOddsApiSource` and run the scheduler as a
   daemon (real wall clock):
   ```bash
   python -c "from live_odds_source import TheOddsApiSource; from ingestion import Pipeline; \
     Pipeline(TheOddsApiSource(sport_key='soccer_fifa_world_cup'),'pof_mvp.db').run(virtual=False, speed=300)"
   ```
   It registers fixtures + q_open, snapshots q_lock at `lock_at`, and on each result writes q_close +
   auto-scores every revealed prediction (RPS / CLV / realized-alpha).
3. **Point the terminal** at the deployed backend (`API_BASE`), wire `user_id` to your auth/session.
4. **Migrate to Postgres** with `mvp_schema.sql` (recommended once you have concurrent users).
5. **Tune `lock_at`.** The pipeline logs `|q_now−q_open|/|q_close−q_open|`; after a few rounds re-run
   `lock_scan.py` on the live World-Cup odds and set `lock_at` to the band's wall-clock equivalent.
   (EPL barely moves; cup group games should move more — recalibrate on real tournament data.)

---

## 6. Tournament operating loop (per matchday)

```
slate opens   ─▶  ingestion.register()       q_open captured, fixtures live in the terminal
users commit  ─▶  backend /predictions        only the hash stored; q_submit snapshotted server-side
lock_at       ─▶  ingestion.lock_tick()        q_lock captured; submissions frozen
kickoff       ─▶  (match plays)
result in     ─▶  ingestion.settle_tick()      q_close + result; revealed predictions auto-scored
post-match    ─▶  users reveal salts           reveal verifies byte-for-byte; non-revealers worst-cased
read-out      ─▶  /leaderboard + oracle view   absolute skill (leaderboard) vs CLV/alpha (oracle weight)
```

**MVP success = the four Phase-1 gates on REAL users:**
P1 reveal reliability ≥ 95% · P2 crowd excess-CLV-vs-submit > 0 · P3 crowd beats a public model vs lock ·
P4 calibration holds. If P2/P3 show signs on real users, the project moves from *measurement system*
to *product signal*.

---

## 7. Security & integrity properties (already enforced in code)

- **Commitment binds, reveal verifies.** Server stores only `commitment_hash`; reveal recomputes
  SHA-256 with the canonical scheme (`commitment_reference.py`) and accepts only a byte-for-byte match.
- **A fulfilled commitment is immutable.** A tampered reveal cannot overwrite a valid one
  (regression-tested in `pof_e2e_test.py`).
- **Server-authoritative `q_submit`.** The market at submit time is snapshotted server-side, never
  trusted from the client — this is the latency-arbitrage defense's engineering anchor.
- **No selective non-reveal.** Committed-but-unrevealed predictions are worst-cased on the leaderboard;
  oracle eligibility is gated on reveal reliability.
- **Two separate scores.** Absolute-skill leaderboard (engagement) vs CLV/alpha oracle weight (B2B).
  A market-copier can top the leaderboard yet carry zero oracle weight — by design.

---

## 8. Deferred to later phases (intentionally not built yet)

On-chain anchoring beyond a per-round Merkle root; soulbound calibration badges (ERC-5192); pluggable
ZK proof-of-personhood at the payout layer; gasless L2 + paymaster; threshold-encryption / homomorphic
aggregation endgame. None are needed to answer the one open question, so none were built. The MVP is
deliberately operator-holds-plaintext + commit-reveal: auditable, not yet fully trustless.

---

*Phases 0–1 complete. The buildable surface is finished; what remains is operational —
an odds key, a deployment, and real people.*
