"""
Proof of Foresight — live odds adapter for The Odds API (v4).

Concrete implementation of ingestion.py's OddsSource interface. The lifecycle scheduler
in ingestion.py is UNCHANGED; this just supplies real data. The moment you have an API
key, the live pipeline runs:

    export ODDS_API_KEY=...           # from https://the-odds-api.com (paid tier for soccer)
    python -c "from live_odds_source import TheOddsApiSource; from ingestion import Pipeline; \
               Pipeline(TheOddsApiSource(sport_key='soccer_fifa_world_cup'), 'pof_mvp.db').run(virtual=False, speed=300)"

Endpoint shape (verified against the-odds-api v4 docs, June 2026):
  GET /v4/sports/{sport_key}/odds?regions=eu,uk&markets=h2h&oddsFormat=decimal&bookmakers=pinnacle&apiKey=...
  -> [ { id, commence_time, home_team, away_team,
         bookmakers:[ { key, markets:[ { key:'h2h', outcomes:[ {name, price}, ... ] } ] } ] }, ... ]
  GET /v4/sports/{sport_key}/scores?daysFrom=3&apiKey=...
  -> [ { id, completed, home_team, away_team, scores:[ {name, score}, ... ] }, ... ]

CRITICAL parsing notes baked in below:
  * h2h outcomes are keyed by NAME (home team / away team / "Draw"), NOT array order.
    The docs example lists the away team first — never map by position.
  * Pinnacle is requested explicitly (sharp, low-vig). If absent for an event we fall
    back to the median across returned books and RECORD which source was used.
  * Three snapshots come from WHEN we query: register-time = open, lock_at = lock,
    post-kickoff = close. This adapter just returns "odds now"; the scheduler times it.

No API key is bundled. Until coverage for soccer_fifa_world_cup opens, confirm the exact
sport_key via GET /v4/sports and the response field names with a single live call; the
parser is defensive so a minor schema change is a small edit, not a rewrite.
"""
from __future__ import annotations
import os, time, urllib.parse, urllib.request, json
from typing import Optional
from statistics import median

from ingestion import OddsSource, Fixture

V4 = "https://api.the-odds-api.com/v4"
DRAW_NAMES = {"draw", "tie", "x"}


class TheOddsApiSource(OddsSource):
    def __init__(self, sport_key="soccer_fifa_world_cup", regions="eu,uk",
                 prefer_book="pinnacle", api_key=None, competition="FIFA WORLD CUP 2026",
                 cache_ttl=20.0):
        self.sport_key = sport_key
        self.regions = regions
        self.prefer = prefer_book
        self.competition = competition
        self.api_key = api_key or os.environ.get("ODDS_API_KEY")
        if not self.api_key:
            raise SystemExit("Set ODDS_API_KEY (env) or pass api_key=... — get one at the-odds-api.com")
        self._cache = {}          # url -> (ts, json) ; avoid hammering quota within a tick
        self._cache_ttl = cache_ttl
        self._idmap = {}          # our int match_id -> provider event id + names
        self._next_id = 700000

    # ---------------- HTTP ----------------
    def _get(self, path, params):
        params = {**params, "apiKey": self.api_key}
        url = f"{V4}{path}?{urllib.parse.urlencode(params)}"
        now = time.time()
        hit = self._cache.get(url)
        if hit and now - hit[0] < self._cache_ttl:
            return hit[1]
        req = urllib.request.Request(url, headers={"User-Agent": "PoF/1.0"})
        with urllib.request.urlopen(req, timeout=20) as r:
            remaining = r.headers.get("x-requests-remaining")
            used = r.headers.get("x-requests-used")
            data = json.loads(r.read().decode())
        if remaining is not None:
            print(f"  [odds-api] quota used={used} remaining={remaining}")
        self._cache[url] = (now, data)
        return data

    # ---------------- h2h parsing ----------------
    def _book_h2h(self, bm, home, away):
        """Return decimal [H,D,A] from one bookmaker's h2h market, mapped BY NAME."""
        for mk in bm.get("markets", []):
            if mk.get("key") != "h2h":
                continue
            h = d = a = None
            for o in mk.get("outcomes", []):
                nm = (o.get("name") or "").strip()
                price = o.get("price")
                if nm == home:
                    h = price
                elif nm == away:
                    a = price
                elif nm.lower() in DRAW_NAMES:
                    d = price
            if h and d and a:
                return [float(h), float(d), float(a)]
        return None

    def _event_odds(self, ev):
        """Best [H,D,A] for an event: Pinnacle if present, else median across books.
        Returns (odds, source_label)."""
        home, away = ev["home_team"], ev["away_team"]
        books = ev.get("bookmakers", [])
        # prefer the sharp book
        for bm in books:
            if bm.get("key") == self.prefer:
                o = self._book_h2h(bm, home, away)
                if o:
                    return o, self.prefer
        # fallback: median of each outcome across all books that quote h2h
        triples = [t for t in (self._book_h2h(bm, home, away) for bm in books) if t]
        if not triples:
            return None, None
        med = [median(t[i] for t in triples) for i in range(3)]
        return med, f"median:{len(triples)}books"

    def _find_event(self, match_id):
        """Re-query current odds for the league and return the event matching match_id."""
        data = self._get(f"/sports/{self.sport_key}/odds",
                         {"regions": self.regions, "markets": "h2h", "oddsFormat": "decimal",
                          "bookmakers": self.prefer})
        meta = self._idmap.get(match_id)
        if not meta:
            return None
        for ev in data:
            if ev.get("id") == meta["event_id"]:
                return ev
        return None

    # ---------------- OddsSource interface ----------------
    def upcoming_fixtures(self):
        data = self._get(f"/sports/{self.sport_key}/odds",
                         {"regions": self.regions, "markets": "h2h", "oddsFormat": "decimal",
                          "bookmakers": self.prefer})
        out = []
        for ev in data:
            o, src = self._event_odds(ev)
            if not o:
                continue
            # stable provider-id -> our int id
            mid = next((m for m, v in self._idmap.items() if v["event_id"] == ev["id"]), None)
            if mid is None:
                mid = self._next_id; self._next_id += 1
                self._idmap[mid] = {"event_id": ev["id"], "home": ev["home_team"], "away": ev["away_team"]}
            ko = _iso_to_epoch(ev["commence_time"])
            out.append(Fixture(match_id=mid, competition=self.competition,
                               home=ev["home_team"], away=ev["away_team"],
                               kickoff_at=ko,
                               lock_at=ko - 300,            # default: lock 5 min before kickoff;
                                                            # tune via lock_scan on live odds
                               odds_open=o, source=f"the-odds-api:{src}"))
        return out

    def odds_at(self, match_id, when):
        """when in {'lock','close'} -> re-query the provider NOW and return current [H,D,A].
        The scheduler calls this AT lock_at and after kickoff, so 'now' is the right snapshot."""
        ev = self._find_event(match_id)
        if not ev:
            return None
        o, _ = self._event_odds(ev)
        return o

    def result_of(self, match_id):
        meta = self._idmap.get(match_id)
        if not meta:
            return None
        scores = self._get(f"/sports/{self.sport_key}/scores", {"daysFrom": 3})
        for s in scores:
            if s.get("id") != meta["event_id"]:
                continue
            if not s.get("completed"):
                return None
            sc = {x.get("name"): _to_int(x.get("score")) for x in (s.get("scores") or [])}
            hg, ag = sc.get(meta["home"]), sc.get(meta["away"])
            if hg is None or ag is None:
                return None
            return "H" if hg > ag else ("A" if hg < ag else "D")
        return None


def _iso_to_epoch(iso):
    import datetime
    return datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def _to_int(x):
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


if __name__ == "__main__":
    # tiny self-check that doesn't need a key: parser maps by NAME, not position
    class _Stub(TheOddsApiSource):
        def __init__(self): pass
    s = _Stub.__new__(_Stub); s.prefer = "pinnacle"
    ev = {"home_team": "Mexico", "away_team": "Poland",
          "bookmakers": [{"key": "pinnacle", "markets": [{"key": "h2h", "outcomes": [
              {"name": "Poland", "price": 3.7}, {"name": "Draw", "price": 3.3},
              {"name": "Mexico", "price": 2.1}]}]}]}
    o, src = TheOddsApiSource._event_odds(s, ev)
    assert o == [2.1, 3.3, 3.7], o   # H=Mexico, D, A=Poland — correct despite away-first order
    print("parser OK — maps by name not position:", o, "via", src)
