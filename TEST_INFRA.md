# Test Infrastructure & E2E Test Suite Architecture

**Project:** Multi-Agent Funding-Rate Research Swarm  
**Specification Version:** 1.0.0 (Benchmark Rigor)  
**Target Package:** `funding-rate-bot`  
**Test Suite Directory:** `tests/e2e/`  

---

## 1. Executive Test Architecture & Philosophy

The Multi-Agent Funding-Rate Research Swarm is a mission-critical quantitative research and execution system. The testing methodology follows a strict **opaque-box, requirement-driven, 4-tier hierarchical test architecture**:

```
+---------------------------------------------------------------------------------------------------+
|                                 4-TIER E2E TEST SUITE ARCHITECTURE                                |
+---------------------------------------------------------------------------------------------------+
|                                                                                                   |
|  [ TIER 1: Feature Coverage ]         --> >=5 Happy path & core mechanics tests per feature       |
|                                           (Features 1 to 38: >= 190 tests)                        |
|                                                                                                   |
|  [ TIER 2: Boundary & Corner Cases ]  --> >=5 Boundary, edge-case, and error handling tests       |
|                                           (Zero/negative values, precision, timeouts: >= 190 tests)|
|                                                                                                   |
|  [ TIER 3: Cross-Feature Combinations]--> Pairwise & multi-module integration permutations         |
|                                           (Desync + Watchdog + KillSwitch + Multi-Exchange)       |
|                                                                                                   |
|  [ TIER 4: Real-World Workloads ]     --> Multi-day market simulations across historical regimes  |
|                                           (Bull Contango, Bear Backwardation, CYBER Dispersion)   |
|                                                                                                   |
+---------------------------------------------------------------------------------------------------+
```

### Core Verification Doctrines
1. **The Swarm Oath & Anti-Mocking Rule**: All test scenarios execute genuine quantitative formulas, discrete-event timing models, SQLite relational transactions, and state machine transitions.
2. **Deterministic Isolation**: Each test establishes its own isolated sandbox environment (isolated temporary SQLite databases, ephemeral directory state trees, and fresh agent personas) to guarantee zero state leakage across test cases.
3. **Forensic Traceability**: All test assertions map directly to specific clauses and mathematical definitions in `PROJECT.md` and Survey Reports 1, 2, and 3.

---

## 2. Feature Inventory Coverage Matrix (38 Features)

| Feature # | Feature Name | Core Module | Tier 1 (Happy Path) | Tier 2 (Boundaries) | Tier 3 (Combinations) | Tier 4 (Workloads) |
|---|---|---|---|---|---|---|
| **F-01** | The Swarm Oath (6 Rules) | `src.swarm.oath` | >=5 | >=5 | Yes | Yes |
| **F-02** | Testnet-Only Assertion | `src.core.guardrails` | >=5 | >=5 | Yes | Yes |
| **F-03** | Risk-Cap Intake Assertion | `src.core.guardrails` | >=5 | >=5 | Yes | Yes |
| **F-04** | "Arm for Live Trading" Switch | `src.core.guardrails` | >=5 | >=5 | Yes | Yes |
| **F-05** | Reviewed-Code Assertion | `src.core.guardrails` | >=5 | >=5 | Yes | Yes |
| **F-06** | SQLite Persistence Engine | `src.storage.database` | >=5 | >=5 | Yes | Yes |
| **F-07** | Standard Agent Memo Spec | `src.ipc.memo` | >=5 | >=5 | Yes | Yes |
| **F-08** | 5-State Directory Machine | `src.ipc.state_machine` | >=5 | >=5 | Yes | Yes |
| **F-09** | Ledger Hierarchy | `src.ipc.ledgers` | >=5 | >=5 | Yes | Yes |
| **F-10** | Agent Personas & Mandates | `src.swarm.personas` | >=5 | >=5 | Yes | Yes |
| **F-11** | Phase A Handshake | `src.swarm.pipeline` | >=5 | >=5 | Yes | Yes |
| **F-12** | Phase B Handshake | `src.swarm.pipeline` | >=5 | >=5 | Yes | Yes |
| **F-13** | Phase C Handshake | `src.swarm.pipeline` | >=5 | >=5 | Yes | Yes |
| **F-14** | Phase D Handshake | `src.swarm.pipeline` | >=5 | >=5 | Yes | Yes |
| **F-15** | Gate Decision Quorum | `src.swarm.consensus` | >=5 | >=5 | Yes | Yes |
| **F-16** | Phase E Paper Trading | `src.swarm.pipeline` | >=5 | >=5 | Yes | Yes |
| **F-17** | Adaptive Planning Loop | `src.ipc.ledgers` | >=5 | >=5 | Yes | Yes |
| **F-18** | Conflict Escalation Protocol | `src.swarm.consensus` | >=5 | >=5 | Yes | Yes |
| **F-19** | Exchange Connectors | `src.connectors.binance` / `bybit` / `delta_india` | >=5 | >=5 | Yes | Yes |
| **F-20** | Simulated Paper Fallback | `src.connectors.paper_mock` | >=5 | >=5 | Yes | Yes |
| **F-21** | Fee Engineering & MVS | `src.market.fee_verifier` | >=5 | >=5 | Yes | Yes |
| **F-22** | 4 Historical Regimes | `src.market.regimes` | >=5 | >=5 | Yes | Yes |
| **F-23** | Vectorized Backtest Engine | `src.backtest.engine` | >=5 | >=5 | Yes | Yes |
| **F-24** | Idea 03 High-Fidelity Timing | `src.backtest.timing` | >=5 | >=5 | Yes | Yes |
| **F-25** | Lookahead Bias & Overfit Audit | `src.backtest.audit` | >=5 | >=5 | Yes | Yes |
| **F-26** | Strategy-Agnostic Interface | `src.engine.interfaces` | >=5 | >=5 | Yes | Yes |
| **F-27** | Pre-Trade Risk Engine | `src.engine.risk` | >=5 | >=5 | Yes | Yes |
| **F-28** | Real-Time Desync Watchdog | `src.engine.watchdog` | >=5 | >=5 | Yes | Yes |
| **F-29** | Crash-Resistant Kill-Switch | `src.engine.risk` | >=5 | >=5 | Yes | Yes |
| **F-30** | Idea 03 Strategy Module | `src.strategies.idea_03_cross_exchange` | >=5 | >=5 | Yes | Yes |
| **F-31** | Idea 01 Strategy Module | `src.strategies.idea_01_cash_and_carry` | >=5 | >=5 | Yes | Yes |
| **F-32** | Idea 02 Strategy Module | `src.strategies.idea_02_rate_momentum` | >=5 | >=5 | Yes | Yes |
| **F-33** | Idea 04 Strategy Module | `src.strategies.idea_04_ml_prediction` | >=5 | >=5 | Yes | Yes |
| **F-34** | Agent Research Slot (RS) | `src.strategies.idea_rs_ou_mean_reversion` | >=5 | >=5 | Yes | Yes |
| **F-35** | Full Pipeline Execution | `src.swarm.pipeline` | >=5 | >=5 | Yes | Yes |
| **F-36** | Swarm Review & Handoff | `src.swarm.pipeline` / `src.ipc.ledgers` | >=5 | >=5 | Yes | Yes |
| **F-37** | 4-Tier E2E Test Suite | `tests/e2e/` | >=5 | >=5 | Yes | Yes |
| **F-38** | Forensic Integrity Verification | `src.core.audit` | >=5 | >=5 | Yes | Yes |

---

## 3. Detailed Tier Breakdown & Specifications

### Tier 1: Feature Coverage (`tests/e2e/test_tier1_features.py`)
- **Objective:** Exhaustive opaque-box verification of nominal, happy-path functionality for every single feature (F-01 through F-38).
- **Target Count:** $\ge 5$ discrete test cases per feature ($\ge 190$ tests total).
- **Focus Areas:**
  - Standard inputs, parameter validation, expected return types, and correct side-effects.
  - State machine transitions with valid signature trails.
  - Correct mathematical calculation of 4-way taker fee drag ($0.200\%$), slippage ($0.100\%$), MVS hurdle rates ($0.40\% - 0.50\%$), and funding payments.

### Tier 2: Boundary & Corner Cases (`tests/e2e/test_tier2_boundaries.py`)
- **Objective:** Adversarial boundary condition and error handling verification across all 38 features.
- **Target Count:** $\ge 5$ discrete test cases per feature ($\ge 190$ tests total).
- **Focus Areas:**
  - Numeric limits: zero values, negative funding rates, extreme leverage, zero/infinite capital, precision rounding truncation (Binance `stepSize`, Delta India contract lots).
  - Network & Protocol limits: Mainnet URL injection attempts, HTTP 429 rate limit backoff, exchange socket timeouts, corrupted JSON payloads.
  - Security & Guardrails: Veto without remediation rejected by DELTA, unreviewed 3rd-party code blocked, illegal gate bar lowering rejected.

### Tier 3: Cross-Feature Combinations (`tests/e2e/test_tier3_combinations.py`)
- **Objective:** Pairwise and multi-feature interaction testing across complex execution workflows.
- **Scenarios Tested:**
  1. *Dual-Leg Cross-Exchange Arbitrage with Simulated Leg Desync & Sub-500ms Market Unwind*: Binance Short fills + Bybit Long rejects $\rightarrow$ Desync Watchdog triggers emergency market unwind $\rightarrow$ Realized slippage PnL recorded in SQLite.
  2. *Pipeline Handshake with BETA Hard Veto, Remediation Rework, and Second-Round Gate Approval*: BETA challenges Phase A residual risks $\rightarrow$ GAMMA updates CONCEPTS.md $\rightarrow$ Phase B $\rightarrow$ Phase C $\rightarrow$ Phase D $\rightarrow$ Unanimous Gate PASS.
  3. *Mainnet Endpoint Injection during Phase E Paper Trading*: Rogue URL in feed config $\rightarrow$ TESTNET-ONLY assertion fires instantly $\rightarrow$ Dual-persistence Kill-Switch locked (SQLite + `KILL_SWITCH.latch`) $\rightarrow$ Process halt.
  4. *Multi-Strategy Concurrent Execution under Global Pre-Trade Risk Caps*: Idea 01, Idea 02, and Idea 03 running simultaneously $\rightarrow$ Portfolio leverage cap ($3.0\times$) and liquidation distance buffer ($\ge 35\%$) enforced across all orders.
  5. *Deadlock Escalation after 2 Debate Rounds with Swarm Backlog Branching*: ALPHA and BETA deadlocked on execution latency $\rightarrow$ Memos logged to STATUS.md under "Needs human input" $\rightarrow$ Swarm branches to Idea 01 without idling.

### Tier 4: Real-World Application Workloads (`tests/e2e/test_tier4_workloads.py`)
- **Objective:** Multi-day end-to-end discrete-event market simulations across authentic historical crypto market regimes.
- **Scenarios Tested:**
  1. *Regime 1: Bull Contango 21-Settlement Simulation*:
     - 7-day continuous run across 21 8-hour settlements ($T \in \{00:00, 08:00, 16:00\text{ UTC}\}$).
     - BTC/ETH funding rates consistently $+0.045\%$, altcoin rates $+0.150\%$.
     - Spot-Perp Cash-and-Carry (Idea 01) and Cross-Exchange Spread (Idea 03) capture steady positive carry.
  2. *Regime 2: Bear Backwardation & Flash Crash Liquidation Cascade*:
     - Terra/Luna and FTX collapse conditions (negative funding $-0.250\%$ to $-0.750\%$, short squeezes, basis volatility $\Delta B = \pm 1.25\%$).
     - Desync Watchdog withstands market impact; kill-switch remains armed and untripped.
  3. *Regime 4: Structural Altcoin Dispersion (CYBER / TIA Mania)*:
     - Cross-venue rate dispersion $|F_A - F_B| > 1.80\%$ per 8h.
     - Thin orderbook liquidity walking; VWAP slippage accounting; MVS threshold filtering out unprofitable noise.
  4. *Full End-to-End Swarm Research Pipeline*:
     - Comprehensive traversal of Idea 03 from `/backlog` through Phase A, Phase B, Phase C (4 regimes), Phase D (watchdog & risk spec), Gate Decision (unanimous 4/4 approval), to Phase E Paper Trading with real-time drift telemetry.

---

## 4. Test Execution & Runner Invocations

The suite is executed using standard `pytest`:

```bash
# Run the entire E2E test suite
pytest tests/e2e/ -v

# Run individual test tiers
pytest tests/e2e/test_tier1_features.py -v
pytest tests/e2e/test_tier2_boundaries.py -v
pytest tests/e2e/test_tier3_combinations.py -v
pytest tests/e2e/test_tier4_workloads.py -v

# Run with coverage report
pytest tests/e2e/ --cov=src --cov-report=term-missing
```
