# Hunchproof — web frontend

> **Turn your hunch into proof.** The production frontend for hunchproof.com — an auditable
> market-residual intelligence engine for football. A **belief market, not a betting market.**

React + TypeScript + Vite + Tailwind. Four routed, code-split views — **Slate**, **Portfolio**,
**Leaderboards**, **Oracle** — over a typed client for the FastAPI backend
(`product/pof_backend.py`), with a self-contained **demo mode** (synthetic data, clearly
labeled) so the site runs with no backend.

This app extends the original single-file `product/hunchproof_app.html`. It preserves, byte-for-
byte, the canonical commitment scheme (`PoF|v1`) and the scoring definitions; client-side scoring
is **display-only** — the backend/ingestion pipeline is authoritative for RPS / CLV / alpha.

---

## Quick start

```bash
cd web
npm install
npm run dev            # http://localhost:5173  (demo mode — no backend needed)
```

Point it at a backend (live mode) in any of three ways (first wins):

```bash
# 1. build-time env
echo 'VITE_API_BASE=http://127.0.0.1:8000' > .env.local && npm run dev
# 2. one-off query param         → http://localhost:5173/?api=http://127.0.0.1:8000
# 3. injected global             → window.POF_API_BASE = "https://api.hunchproof.com"
```

When `VITE_API_BASE` (or an override) is set, the connection badge shows **live**; otherwise it
shows **demo · synthetic data**.

### Backend + frontend together (one command)

```bash
cd ../product && ./run_local.sh          # FastAPI backend + this Vite app, VITE_API_BASE auto-wired
./run_local.sh --replay ../research/real_data   # also seed real fixtures (needs football-data CSVs)
./run_local.sh --legacy                  # serve the original single-file UI instead
```

`run_local.sh` provisions a Python ≥3.11 venv for the backend automatically.

---

## Scripts

| command | what |
| --- | --- |
| `npm run dev` | Vite dev server (HMR) |
| `npm run build` | typecheck (`tsc --noEmit`) + production build to `dist/` |
| `npm run preview` | serve the built `dist/` locally |
| `npm run test` | Vitest — commitment **Python==JS parity** + scoring identities |
| `npm run typecheck` | type-only check |

The commitment test asserts the browser scheme reproduces the Python reference hash
(`product/commitment_reference.py`) byte-for-byte — re-run it if you ever touch `lib/commitment.ts`.

---

## The core flow — seal → reveal → score

1. **Slate** loads the open fixtures (`GET /api/fixtures/open`). Three sliders per match always
   normalize to 100%; predicting **every** match is mandatory (anti-cherry-picking).
2. **Seal** quantizes each pick to permille, draws a 256-bit salt, computes
   `SHA-256(PoF|v1|{match_id}|{H}-{D}-{A}|{salt})`, and (live) POSTs each `{user_id, match_id,
   commitment_hash}` — sealing locally only if the server accepts **all**. The distribution is
   never sent at commit; the server snapshots `q_submit` authoritatively.
3. **Reveal** (Portfolio, after lock) sends `{user_id, match_id, p, salt_hex}`; the server
   recomputes the hash byte-for-byte and accepts only an exact match. A fulfilled commitment is
   immutable; a mismatch never mutates state.
4. **Score**: CLV-vs-submit is the hero metric (your edge over the line you faced); realized
   alpha is shown as secondary/high-variance.

Salts live in a `localStorage` vault (`hooks/useCommitVault.ts`) — they are the only way to
reveal, so they are kept client-side and never transmitted at commit.

---

## Build & deploy

```bash
npm run build       # → dist/ (static)
```

Deploy `dist/` to any static host (Vercel, Netlify, S3+CloudFront, nginx). Two notes:

- **SPA fallback**: rewrite all unknown paths to `/index.html` (client-side routing). E.g.
  Vercel `vercel.json`: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`;
  Netlify `_redirects`: `/*  /index.html  200`.
- **`VITE_API_BASE` is baked at build time.** Set it in the host's build env, or leave it unset
  and inject `window.POF_API_BASE` at runtime (e.g. a small `<script>` or edge config) so the
  same build can target different backends.

---

## Project structure

```
src/
  config.ts            API_BASE resolution + live/demo mode + scheme version
  lib/                 commitment.ts (PoF|v1 port), scoring.ts, slate.ts, format.ts, theme.ts  (+ *.test.ts)
  api/                 types.ts (backend contract), client.ts (typed fetch), derive.ts (live→view-models), queries.ts (React Query)
  demo/                data.ts + crowd.ts — seeded synthetic showcase (labeled SYNTHETIC)
  models.ts            view-models shared by demo + live producers
  hooks/               useCommitVault (salts), useUser, useCountdown, useToast
  components/          ui/ (Card, Tile, DistBar, HashChip, charts, Modal, states…), layout/, slate/, portfolio/
  views/               SlateView, PortfolioView, LeaderboardsView, OracleView  (lazy-loaded)
```

---

## Honesty & guardrails (see repo `CLAUDE.md` / `docs/STATUS.md`)

- Individual reward is benchmarked vs the **submit-time** market, never the opening line.
- The server snapshots `q_submit`; the client never sends a market price.
- Only the commitment hash is stored at commit — the distribution is invisible pre-reveal.
- The two scores (absolute calibration vs CLV/oracle weight) are never merged; the oracle is
  **robust LCB-weighted, never equal-weighted**.
- Demo data is synthetic by construction and labeled as such — it validates the *ruler and the
  gates*, **not** that a real crowd has edge. In live mode, the robust crowd aggregate and gates
  P2–P4 are computed server-side (ingestion) and not yet surfaced via the API; the Oracle view is
  explicit about this.
- It is **not betting** — this boundary is kept in user-facing copy throughout.
```
