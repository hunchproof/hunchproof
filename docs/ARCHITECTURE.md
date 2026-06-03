# Hunchproof — Architecture

How the pieces fit and how data flows. Implements the mechanism in `MECHANISM.md`.

---

## Two layers

- **Research layer** (`research/`) — the measurement harness. Validates the ruler on real
  historical odds. Not part of the live serving path, but it's where the metrics are defined
  and where you re-run `lock_scan.py` on new data. Treat it as the source of truth for the
  scoring math; the product layer mirrors its definitions.

- **Product layer** (`product/`) — the live runtime: a frontend, a backend, and an ingestion
  pipeline that all share one database. This is what real users touch.

The scoring definitions (RPS, no-vig, CLV) appear in both layers and MUST stay consistent.
`research/phase0.py` is the canonical reference; `product/ingestion.py` reuses its no-vig.

---

## Runtime components

```
                 ┌───────────────────────────────────────────────┐
                 │  hunchproof_app.html  (4-view SPA frontend)     │
                 │  Slate · Portfolio · Leaderboards · Oracle      │
                 │  - commit-reveal in-browser (Web Crypto SHA-256)│
                 │  - JS port of the scoring math (display only)   │
                 └───────────────┬───────────────────────────────┘
                                 │  HTTP (?api=<backend>)
                                 ▼
                 ┌───────────────────────────────────────────────┐
                 │  pof_backend.py  (FastAPI)                      │
                 │  GET  /api/fixtures/open      (the slate)       │
                 │  GET  /api/fixtures/next-open (single)          │
                 │  POST /api/predictions        (commit: hash only│
                 │        + server snapshots q_submit)             │
                 │  POST /api/predictions/reveal (verify + score)  │
                 │  GET  /api/predictions, /api/leaderboard        │
                 └───────────────┬───────────────────────────────┘
                                 │  shared SQLite (dev) / Postgres (prod)
                                 ▼
                 ┌───────────────────────────────────────────────┐
                 │  ingestion.py  (lifecycle scheduler)            │
                 │  register  → q_open                             │
                 │  lock_tick → q_lock + freeze (at lock_at)       │
                 │  settle    → q_close + result + AUTO-SCORE       │
                 │  OddsSource interface:                          │
                 │   - ReplaySource  (real historical CSVs, no key)│
                 │   - TheOddsApiSource (live; live_odds_source.py)│
                 └───────────────────────────────────────────────┘
```

---

## Data model (mvp_schema.sql — Postgres; SQLite mirrors it for dev)

**`matches`** — one row per fixture:
`match_id, competition, home, away, kickoff_at, lock_at,
 odds_open/odds_lock/odds_close (decimal [H,D,A] json),
 q_open/q_lock/q_close (no-vig probs json), odds_source, result, match_status`
status flow: `SCHEDULED → LOCKED → FINAL`.

**`predictions`** — one row per (user, slate, match) (UNIQUE):
`prediction_id, user_id, slate_id, match_id,
 submitted_at, locked_at, revealed_at,
 commitment_hash, salt_hex,
 p_h/p_d/p_a (permille, set at reveal), q_submit (server-authoritative no-vig),
 reveal_flag, valid_commit,
 rps, log_loss, clv, alpha_close`
At commit time only `commitment_hash` + `q_submit` are set; `p_*`/`salt` arrive at reveal;
`rps/clv/alpha_close` are filled by the ingestion settle step.

**`slates` / `slate_matches`** (in mvp_schema.sql) — the mandatory pre-committed slate.
**`ingestion_log`** — append-only audit of register/lock/settle events.

> Note: `pof_backend.py` (SQLite, dev) currently keeps a lean version of these tables inline,
> unified with `ingestion.py`. `mvp_schema.sql` is the fuller Postgres target. When migrating
> to Postgres, port the backend/ingestion table definitions to `mvp_schema.sql` — the column
> shapes already match, so logic is unchanged.

---

## Commit → reveal → score sequence

```
user sets sliders ─▶ browser quantizes to permille, draws random salt,
                     computes SHA-256(preimage)  ───────────────────────┐
                                                                         ▼
POST /api/predictions {user_id, match_id, commitment_hash}     server: reject if locked /
                                                               duplicate; snapshot q_submit
                                                               from current q_open; store
                                                               ONLY the hash. status SEALED.
        … time passes, lock_at arrives …
ingestion.lock_tick(): snapshot q_lock, set match LOCKED, freeze submissions.
        … kickoff, match plays, result known …
ingestion.settle_tick(): snapshot q_close, set result, status FINAL,
                         AUTO-SCORE every revealed+valid prediction
                         (rps, log_loss, clv vs submit, alpha vs close).
        … user reveals after lock …
POST /api/predictions/reveal {user_id, match_id, p[H,D,A], salt_hex}
       server recomputes SHA-256 with the canonical scheme;
       accept ONLY on byte-for-byte match; a fulfilled commitment is immutable;
       a failed reveal never mutates the row. On success store p_*, salt, mark revealed.
```

The clock: in **replay** mode ingestion uses a virtual clock (jumps to each event); in
**live** mode it's a real wall-clock daemon (`run(virtual=False, speed=<seconds>)`).

---

## Frontend ↔ backend contract

- The SPA reads `API_BASE` from a constant, `window.POF_API_BASE`, or `?api=` query param.
  `null` ⇒ self-contained demo mode (synthetic data, labeled "demo · synthetic data").
- Live mode loads the slate from `GET /api/fixtures/open` (do NOT hardcode fixtures).
- Commit posts each `{user_id, match_id, commitment_hash}` and **verifies the server accepted
  ALL before sealing locally**; any rejection is surfaced to the user (not fire-and-forget).
- The frontend's JS scoring is for **display only**; the backend/ingestion is authoritative.

Verified: a real browser→backend loop works — slate loads from the server, commits land with
server-snapshotted `q_submit`, distribution invisible pre-reveal, zero console errors.

---

## OddsSource interface (provider-agnostic ingestion)

`ingestion.py` never hardwires a provider. It calls an abstract `OddsSource`:
`upcoming_fixtures() -> [Fixture]`, `odds_at(match_id, when in {'lock','close'}) -> [H,D,A]`,
`result_of(match_id) -> 'H'|'D'|'A'|None`.

- **`ReplaySource`** — drives the whole lifecycle from real football-data CSVs. No key.
  Works today; used to validate the pipeline and to run `lock_scan.py`.
- **`TheOddsApiSource`** (`live_odds_source.py`) — concrete The-Odds-API v4 adapter. Maps h2h
  outcomes **by name** (home/away/"Draw"), NOT array position (the docs list away first!).
  Prefers Pinnacle, falls back to median across books and records which. Needs `ODDS_API_KEY`.

To add a provider: implement the three methods; the scheduler is unchanged.

---

## Going live (condensed; full version in external/README.md)

1. Get a paid odds-API key; confirm the World-Cup `sport_key` (likely `soccer_fifa_world_cup`).
2. Swap `ReplaySource` → `TheOddsApiSource` and run ingestion as a daemon (`virtual=False`).
3. Point the frontend `API_BASE` at the deployed backend; wire `user_id` to real auth.
4. Migrate to Postgres via `mvp_schema.sql`.
5. After a few rounds, re-run `lock_scan.py` on live odds to set `lock_at`.

Stack: Python 3.11+, FastAPI + uvicorn, SQLite→Postgres, single-file HTML/JS frontend
(no build step). `product/run_local.sh` brings up backend + frontend wired together.
