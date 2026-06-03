# Hunchproof — Roadmap (concrete next tasks for Claude Code)

Priority order. Each task notes the constraints it must respect (from CLAUDE.md §constraints)
and how to know it's done. The existing code is tested and working — **extend, don't rewrite**.
After any change to the commitment scheme, schema, or scoring, re-run `tests/` and keep green.

---

## P0 — make the live serving path production-shaped

### T1. Real authentication + user identity
The frontend currently uses a local random `user_id`. Add real auth (email magic-link or
wallet sign-in — wallet fits the eventual on-chain story). Backend must key predictions on a
verified user id.
- Respect: one prediction per (user, slate, match); reveal must be by the same user.
- Done when: a logged-in user's commits/reveals/leaderboard rows are tied to their verified id,
  and `tests/` still pass.

### T2. Wire the reveal UX into the 4-view SPA
The single-match `predict_terminal.html` and the backend have reveal; the full
`hunchproof_app.html` Portfolio view shows open commitments but its reveal button is a stub.
Build the real post-lock reveal flow in Portfolio: client holds the salt, posts
`{user_id, match_id, p, salt_hex}` to `/api/predictions/reveal`, shows verify result + score.
- Respect: reveal only after lock; fulfilled commitment immutable; failed reveal must not
  mutate the row (backend already enforces — don't bypass it client-side).
- Done when: a user can commit a slate, wait for lock (use replay/virtual clock in dev), reveal,
  and see RPS/CLV appear, all through the SPA against the real backend.

### T3. Postgres migration
Port the inline SQLite tables in `pof_backend.py` / `ingestion.py` to `mvp_schema.sql` on
Postgres (column shapes already match). Add connection config via env.
- Done when: `run_local.sh` (or a compose file) can run against Postgres and all tests pass.

---

## P1 — go live with real odds (needs ODDS_API_KEY from the operator)

### T4. Finish + harden the live odds daemon
`live_odds_source.py` implements `TheOddsApiSource`. Confirm the World-Cup `sport_key` via
`GET /v4/sports`, verify field names with one live call, then run ingestion as a wall-clock
daemon (`Pipeline(TheOddsApiSource(...), db).run(virtual=False, speed=300)`).
- Respect: prefer Pinnacle; map h2h by NAME not position; record which book; quota logging.
- Add: retry/backoff, a settle poll for results, alerting if a snapshot is missed at lock_at.
- Done when: against a live key, fixtures register with q_open, q_lock is captured at lock_at,
  and settle writes q_close + result + auto-scores. (Until the key exists, keep ReplaySource
  green as the stand-in.)

### T5. Recalibrate lock_at on live World-Cup odds
Once a few rounds are in, re-run `research/lock_scan.py` on the real tournament odds (the
pipeline already logs `|q_now−q_open|/|q_close−q_open|` per match). Set `lock_at` to the
wall-clock equivalent of the chosen frac.
- Respect: report a BAND, not a fake-precise constant (see how lock_scan does it).
- Done when: `lock_at` for live fixtures is derived from tournament data, not the EPL default.

---

## P2 — the experiment that answers the open question

### T6. Run the live shadow contest (the actual point)
With real users on a real slate, collect committed→revealed predictions and evaluate the
Phase-1 gates **on real people**: P1 reveal reliability ≥95%, **P2 crowd excess-CLV-vs-submit
> 0**, P3 crowd beats a public model vs lock, P4 calibration (needs enough matches).
- Respect: this is the honest test — do not seed/contaminate with synthetic users; label any
  demo data clearly; report CLV (low variance) as primary, realized alpha as display-only.
- Done when: there's a real read on whether a committed crowd produces positive pre-lock CLV.
  If P2/P3 show signs, Hunchproof moves from "measurement system" to "product signal".

---

## P3 — only after P2 shows signs (don't build prematurely)

- On-chain anchoring beyond a per-round Merkle root; soulbound calibration badges (EAS /
  ERC-5192); pluggable ZK proof-of-personhood at the payout layer; gasless L2 + paymaster;
  threshold-encryption / homomorphic aggregation. All deferred — none needed to answer P2/P3.
- Token design: explicitly NOT in v1.

---

## Engineering guardrails (apply to every task)

- Don't merge the two scores (calibration vs CLV/alpha). Don't benchmark individual reward vs
  opening. Don't trust client-supplied market prices. Don't let a failed reveal mutate a row.
  Don't equal-weight the oracle. Don't change the commitment scheme without re-proving Py==JS
  and bumping the version. (Full list: CLAUDE.md §NON-NEGOTIABLE.)
- Keep `tests/pof_e2e_test.py` and `tests/integration_test.py` green.
- Keep the "not betting" boundary in every user-facing string.
- When in doubt about the math, `docs/MECHANISM.md` is the spec and `research/` is the
  reference implementation.
