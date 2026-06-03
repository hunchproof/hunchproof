# Hunchproof

> **hunchproof.com** — turn your hunch into proof.
> An auditable **market-residual intelligence engine** for football. A belief market, not a
> money market. *Not* a sportsbook, *not* a betting market.

This repository is a complete, tested foundation: a validated research layer (the scoring
ruler, proven on 6 real Premier League seasons) and an end-to-end runtime (frontend + backend
+ odds pipeline). It's organized as a handoff package for continued development.

**If you are Claude Code, read [`CLAUDE.md`](./CLAUDE.md) first.** It's the project brief, the
non-negotiable design constraints, and your task list. Then `docs/MECHANISM.md` and
`docs/ARCHITECTURE.md`.

## Quick start

```bash
# 1) (optional) install so modules import cleanly anywhere
pip install -e .            # uses pyproject.toml  — or skip; scripts self-resolve paths

# 2) deps
pip install fastapi "uvicorn[standard]" numpy pandas scipy matplotlib --break-system-packages

# 3) run the product locally (backend + frontend, wired), no API key needed
cd product && ./run_local.sh           # open the printed URL (?api=… already set)

# 4) tests (work in this layout as-is)
cd tests && python pof_e2e_test.py && python integration_test.py
#   integration_test also needs CSVs in research/real_data/ (see that folder's README)

# 5) reproduce the research evidence (needs CSVs in research/real_data/)
cd research && python phase0.py --datadir real_data --outdir ../reports
```

## Layout

```
CLAUDE.md      ← project brief for Claude Code (read first)
docs/          ARCHITECTURE · MECHANISM · STATUS · ROADMAP · GLOSSARY
research/      phase0/phase1/lock_scan/engine/simulate  (the measurement layer)
  real_data/   ← put football-data.co.uk CSVs here (not bundled)
product/       backend · ingestion · live odds adapter · frontend · schema · run_local.sh
tests/         e2e + integration (kept green)
reports/       generated evidence: markdown + PNG figures + per-match CSV
brand/         naming & positioning (中英)
external/      investor one-pager · deployment runbook
```

## Status in one line

Proven on real data: the closing line is a hard bar, the line moves on information, a public
model can't beat it, CLV is the right low-variance metric, the commit→reveal→score pipeline and
the latency-arb defense work, and the browser→backend loop is tested. **Not yet answered (needs
real users): does a committed crowd produce positive pre-lock CLV?** See `docs/STATUS.md`.

Stack: Python 3.11+, FastAPI + SQLite→Postgres, single-file HTML/JS frontend (no build step).
