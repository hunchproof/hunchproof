# research/real_data/ — put the historical odds CSVs here

The research scripts and the integration test read football-data.co.uk season CSVs from this
folder. They are NOT bundled in this handoff (they're third-party data the operator supplies).

**What to put here:** football-data.co.uk match CSVs (e.g. `E0.csv` for an EPL season, one
file per season). Each file must contain at minimum:
- `FTR` (full-time result: H/D/A) and `FTHG`/`FTAG` (goals),
- Pinnacle **opening** odds `PSH` / `PSD` / `PSA`,
- Pinnacle **closing** odds `PSCH` / `PSCD` / `PSCA`,
- `Date`, `HomeTeam`, `AwayTeam`.

Download from https://www.football-data.co.uk (free). The validated Phase-0 run used 6 EPL
seasons (~2,110 matches with complete odds).

**Then:**
```bash
cd ../            # research/
python phase0.py   --datadir real_data --outdir ../reports
python phase1.py   --datadir real_data --outdir ../reports
python lock_scan.py --datadir real_data --outdir ../reports
```

For the World Cup, once the live odds daemon (`product/live_odds_source.py`) has captured
real tournament snapshots, re-run `lock_scan.py` on that data to set `lock_at` (see ROADMAP T5).
