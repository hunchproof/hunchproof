-- ===========================================================================
-- Proof of Foresight — MVP real-user data schema  (PostgreSQL, hardened v2)
-- Four design pillars baked in:
--   (1) commit-reveal            -> salt + commitment_hash, submitted/locked/revealed
--   (2) three market baselines   -> odds_at_submit / odds_at_lock / closing_odds
--   (3) anti-cherry-picking      -> mandatory pre-committed SLATE + coverage/reveal,
--                                   enforced in the REWARD views (worst-case + eligibility gate)
--   (4) two-track scoring        -> Public Score (absolute skill) vs Oracle Weight (alpha/CLV)
--
-- GAME-THEORETIC INVARIANT (why non-reveal can never pay):
--   What binds a user is the COMMITMENT, not the reveal. Once committed before lock
--   a user is on the hook for that match. Reveal a valid preimage -> scored on the
--   revealed distribution. Fail to reveal -> scored WORST-CASE (RPS=1.0, log-loss=−ln ε).
--   Worst-case is strictly worse than revealing ANY honest distribution, so withholding
--   a "bad" prediction is never profitable. There is no abstain inside a mandatory slate.
-- ===========================================================================

-- ---- fixtures + the three odds snapshots (no-vig probs stored alongside) ----
CREATE TABLE matches (
    match_id        BIGSERIAL PRIMARY KEY,
    competition     TEXT NOT NULL,
    season          TEXT NOT NULL,
    home_team       TEXT NOT NULL,
    away_team       TEXT NOT NULL,
    kickoff_at      TIMESTAMPTZ NOT NULL,
    lock_at         TIMESTAMPTZ NOT NULL,          -- predictions freeze here (set EARLY: see note)
    odds_open       NUMERIC[3], odds_lock NUMERIC[3], odds_close NUMERIC[3],
    q_open          NUMERIC[3], q_lock  NUMERIC[3], q_close  NUMERIC[3],   -- no-vig probabilities
    odds_source     TEXT NOT NULL,                 -- 'pinnacle' | 'market_avg' | ... (audit which line)
    result          CHAR(1) CHECK (result IN ('H','D','A')),
    fthg            SMALLINT, ftag SMALLINT,        -- real goals (the model needs them)
    match_status    TEXT NOT NULL DEFAULT 'SCHEDULED',  -- SCHEDULED|FINAL|VOID|POSTPONED
    CHECK (q_close IS NULL OR array_length(q_close,1) = 3),
    CHECK (q_open  IS NULL OR array_length(q_open ,1) = 3)
);

-- ---- a slate = the mandatory, pre-committed set of matches for a round --------
CREATE TABLE slates (
    slate_id        BIGSERIAL PRIMARY KEY,
    competition     TEXT NOT NULL,
    name            TEXT NOT NULL,
    opens_at        TIMESTAMPTZ NOT NULL,
    locks_at        TIMESTAMPTZ NOT NULL
);
CREATE TABLE slate_matches (
    slate_id  BIGINT REFERENCES slates(slate_id),
    match_id  BIGINT REFERENCES matches(match_id),
    PRIMARY KEY (slate_id, match_id)
);

-- ---- one row per (user, slate, match) ----------------------------------------
CREATE TABLE predictions (
    prediction_id      BIGSERIAL PRIMARY KEY,
    user_id            BIGINT NOT NULL,
    slate_id           BIGINT NOT NULL REFERENCES slates(slate_id),
    match_id           BIGINT NOT NULL REFERENCES matches(match_id),
    prediction_version SMALLINT NOT NULL DEFAULT 1,   -- bump if pre-lock edits allowed (see note)

    -- commit-reveal lifecycle
    submitted_at    TIMESTAMPTZ NOT NULL,
    locked_at       TIMESTAMPTZ,
    revealed_at     TIMESTAMPTZ,
    salt            BYTEA,
    commitment_hash BYTEA NOT NULL,                -- H(p_home‖p_draw‖p_away‖salt); on-chain Merkle leaf
    client_version  TEXT,

    -- the prediction (NULL until reveal); CHECKs are NULL-safe so pre-reveal rows pass
    p_home NUMERIC, p_draw NUMERIC, p_away NUMERIC,
    CHECK (p_home >= 0 AND p_draw >= 0 AND p_away >= 0),
    CHECK (p_home <= 1 AND p_draw <= 1 AND p_away <= 1),
    CHECK (ABS((p_home + p_draw + p_away) - 1.0) < 1e-6),

    -- per-user baseline: the no-vig market AT THE MOMENT THIS USER SUBMITTED
    odds_at_submit  NUMERIC[3], q_submit NUMERIC[3],
    CHECK (q_submit IS NULL OR array_length(q_submit,1) = 3),

    -- integrity flags
    reveal_flag  BOOLEAN NOT NULL DEFAULT FALSE,   -- revealed a valid preimage?
    valid_commit BOOLEAN NOT NULL DEFAULT FALSE,   -- hash(reveal) == commitment_hash?

    -- scoring (filled after match_status='FINAL'); NULL while unrevealed/unscored.
    -- Reward views substitute WORST-CASE for committed-but-unrevealed rows (see views).
    rps NUMERIC, log_loss NUMERIC, clv NUMERIC,
    alpha_submit NUMERIC, alpha_lock NUMERIC, realized_alpha_vs_close NUMERIC,

    UNIQUE (user_id, slate_id, match_id, prediction_version)
);
-- NOTE: same match can live in multiple slates -> the unique key MUST include slate_id.
-- For richer pre-lock revision history, add a separate prediction_revisions table later;
-- MVP keeps prediction_version on the row.

-- ===========================================================================
-- REWARD VIEWS — these must NEVER silently drop a non-revealed commitment, or the
-- anti-cherry-picking design is re-opened. Two mechanisms at two layers:
--   (a) Public leaderboard: worst-case substitution for unrevealed commitments.
--   (b) Oracle weighting:   eligibility GATE on reveal_reliability (>= 0.95).
-- ===========================================================================
-- worst-case constants: RPS_MAX = 1.0 (3-outcome ordinal), LOGLOSS_MAX = -ln(1e-6) ≈ 13.8155

-- (a) Public Score inputs — absolute skill; unrevealed commitments scored worst-case.
CREATE VIEW v_leaderboard AS
SELECT p.user_id,
       COUNT(*)                                                              AS n_committed,
       AVG(CASE WHEN p.reveal_flag AND p.valid_commit THEN p.rps      ELSE 1.0     END) AS mean_rps,
       AVG(CASE WHEN p.reveal_flag AND p.valid_commit THEN p.log_loss ELSE 13.8155 END) AS mean_log_loss,
       AVG(CASE WHEN p.reveal_flag AND p.valid_commit THEN 1.0 ELSE 0.0 END) AS reveal_reliability,
       (AVG(CASE WHEN p.reveal_flag AND p.valid_commit THEN 1.0 ELSE 0.0 END) < 0.95) AS unreliable_flag
FROM predictions p JOIN matches m ON m.match_id = p.match_id
WHERE m.match_status = 'FINAL'
GROUP BY p.user_id;

-- (b) Oracle Weight inputs — CLV/alpha over the REVEALED set, but eligibility is GATED
--     on reveal_reliability so selective non-reveal cannot buy a clean CLV.
CREATE VIEW v_oracle_inputs AS
SELECT p.user_id,
       COUNT(*) FILTER (WHERE p.reveal_flag AND p.valid_commit)              AS n_scored,
       AVG(p.clv)                     FILTER (WHERE p.reveal_flag AND p.valid_commit) AS mean_clv,
       STDDEV_SAMP(p.clv)             FILTER (WHERE p.reveal_flag AND p.valid_commit)
         / NULLIF(SQRT(COUNT(*) FILTER (WHERE p.reveal_flag AND p.valid_commit)), 0)  AS se_clv,
       AVG(p.realized_alpha_vs_close) FILTER (WHERE p.reveal_flag AND p.valid_commit) AS mean_realized_alpha_long_run,
       AVG(CASE WHEN p.reveal_flag AND p.valid_commit THEN 1.0 ELSE 0.0 END) AS reveal_reliability,
       (AVG(CASE WHEN p.reveal_flag AND p.valid_commit THEN 1.0 ELSE 0.0 END) >= 0.95) AS oracle_eligible
FROM predictions p JOIN matches m ON m.match_id = p.match_id
WHERE m.match_status = 'FINAL'
GROUP BY p.user_id;
-- Oracle weight (computed downstream, NOT here) only consumes rows WHERE oracle_eligible,
-- and is the robust-portfolio objective over alpha_LCB + residual-covariance decorrelation:
--   Public Score = f(RPS, log_loss, calibration, rank)        -- leaderboard, absolute skill
--   Oracle Weight = f(CLV, realized_alpha_long_run, reliability, coverage, decorrelation, LCB)

-- (c) Descriptive crowd-vs-market diagnostic (NOT a reward input) over the eligible/revealed set.
CREATE VIEW v_slate_market_compare AS
SELECT s.slate_id, s.name,
       AVG(p.alpha_submit)            AS crowd_alpha_vs_submission,
       AVG(p.alpha_lock)              AS crowd_alpha_vs_lock,
       AVG(p.realized_alpha_vs_close) AS crowd_alpha_vs_close,
       AVG(p.clv)                     AS crowd_clv_vs_close
FROM predictions p
JOIN slates  s ON s.slate_id  = p.slate_id
JOIN matches m ON m.match_id = p.match_id
WHERE m.match_status = 'FINAL' AND p.reveal_flag AND p.valid_commit
GROUP BY s.slate_id, s.name;

-- ===========================================================================
-- NOTE on lock_at timing (a real MVP design parameter):
--   CLV needs the line to MOVE between lock_at and kickoff AND the crowd's opinion to
--   be mature. Lock too late -> little movement left -> CLV signal vanishes. Lock too
--   early -> immature opinions. Phase 0 on real odds measures |q_open - q_close| across
--   pre-kickoff windows to choose lock_at where the lock->close window still carries info.
-- ===========================================================================
