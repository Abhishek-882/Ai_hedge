# Project: Multi-Agent Funding-Rate Research Swarm

## Architecture
The system is a decentralized, self-auditing quantitative research and execution swarm designed to evaluate crypto perpetual funding-rate arbitrage strategies. The architecture comprises:

1. **Swarm Operating System & Personas**:
   - **ALPHA** ("The Architect"): Execution engine, code structure, velocity, prototyping.
   - **BETA** ("The Auditor"): Chaos engineering, adversarial failure analysis, hard veto, desync and kill-switch design.
   - **GAMMA** ("The Purist"): Quant research, statistical rigor, lookahead audits, 4 historical regimes, fee verification (>=5 sources).
   - **DELTA** ("The Warden"): DevOps, SQLite persistence, IPC directory state machine, git hygiene, 3rd-party code security, custody of live trading switch.
   - **HUMAN OVERSEER**: Final authority on risk caps, live-trade arming, guardrails, and escalated deadlocks.

2. **File-Based IPC & Directory State Machine**:
   - Directory progression: `/project/docs/ideas/<idea-id>/` moves through `/backlog` -> `/audit` -> `/approved` -> `/paper` -> `/resolved`.
   - Sole legal inter-agent message: 8-field Agent Memo appended to `DEBATE.md`.
   - Ledgers: `STATUS.md` (session board), `MEMORY.md` (decision log), `IDEAS.md` (registry), `PLAN_CHANGELOG.md` (plan evolutions), `STATE.md` (signatures).

3. **Storage & Data Layer**:
   - SQLite 3 with Write-Ahead Logging (WAL) and busy timeout handling.
   - Schemas: `exchange_metadata`, `instruments`, `funding_rates`, `ticker_snapshots`, `orderbook_snapshots`, `fee_schedules`, `regimes`, `regime_datapoints`, `spread_opportunities`, `kill_switch_state`, `audit_log`, `agent_state_audit`.

4. **Market & Exchange Layer**:
   - Connectors: Binance USD-M Futures Testnet, Bybit V5 Linear Testnet, Delta India Testnet, and Simulated Paper Execution Fallback (for offline sandboxes like KuCoin).
   - Precision filters (`LOT_SIZE`, `PRICE_FILTER`, `MIN_NOTIONAL`), contract lot multipliers.

5. **Quantitative Backtest Engine**:
   - Custom vectorized `pandas`/`numpy` discrete-event backtester.
   - Modeling: funding-only-if-held-through-snapshot ($T \in \{00:00, 08:00, 16:00\text{ UTC}\}$), 4-way taker fees ($0.200\%$), slippage ($0.100\%$), basis drift ($\Delta B$), and stochastic leg fill delays.
   - 4 Historical Regimes: Bull Contango, Bear Backwardation, Choppy Rangebound, Structural Dispersion.

6. **Execution Engine & Risk Watchdog (Phase 6)**:
   - Pluggable `BaseStrategy` interface.
   - Real-time executable `DesyncWatchdog` monitoring dual-leg fills and triggering sub-500ms emergency unwinds on single-leg failure.
   - Crash-resistant Kill-Switch with SQLite + disk latch (`KILL_SWITCH.latch`).
   - Testnet-only runtime assertions and pre-flight risk cap validators.

---

## Code Layout

```
funding-rate-bot/
├── PROJECT.md                                # Master Architecture & Feature Inventory
├── requirements.txt                          # Python dependencies (pytest, ccxt, pandas, numpy, etc.)
├── README.md                                 # User documentation & quickstart
├── src/
│   ├── __init__.py
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py                         # System config, env parsing, testnet endpoints
│   │   ├── constants.py                      # Fee defaults, MVS hurdles, regime dates, timeouts
│   │   ├── exceptions.py                     # Custom exception hierarchy (Guardrail, Desync, etc.)
│   │   └── guardrails.py                     # Testnet-only, Risk-cap, ToS, and Live-Switch assertions
│   ├── storage/
│   │   ├── __init__.py
│   │   ├── database.py                       # SQLite manager with WAL mode and connection pooling
│   │   ├── models.py                         # Dataclasses and schemas for SQLite records
│   │   └── schema.sql                        # Full DDL for 12 normalized tables
│   ├── ipc/
│   │   ├── __init__.py
│   │   ├── memo.py                           # Agent Memo formatter, parser, and validator
│   │   ├── state_machine.py                  # Directory lifecycle (/backlog -> /resolved) & DELTA rollback
│   │   └── ledgers.py                        # STATUS.md, MEMORY.md, IDEAS.md, PLAN_CHANGELOG.md managers
│   ├── swarm/
│   │   ├── __init__.py
│   │   ├── personas.py                       # ALPHA, BETA, GAMMA, DELTA agent abstractions & mandates
│   │   ├── pipeline.py                       # 6-phase handshake engine (Phases A, B, C, D, Gate, E)
│   │   ├── consensus.py                      # 4-agent quorum, veto processing, and deadlock escalation
│   │   └── oath.py                           # The Swarm Oath validator and session logger
│   ├── market/
│   │   ├── __init__.py
│   │   ├── feeds.py                          # Multi-exchange ticker, depth & funding rate collectors
│   │   ├── regimes.py                        # 4 Historical Regime data partitioners and metrics
│   │   └── fee_verifier.py                   # 5-point cross-verification and MVS hurdle calculator
│   ├── backtest/
│   │   ├── __init__.py
│   │   ├── engine.py                         # Vectorized discrete-event funding backtester
│   │   ├── metrics.py                        # Expectancy, worst-case drawdown, Sharpe, win rate
│   │   ├── timing.py                         # High-fidelity T-8min/T+90s window and leg fill delays
│   │   └── audit.py                          # Lookahead bias & overfitting detection tools
│   ├── engine/
│   │   ├── __init__.py
│   │   ├── interfaces.py                     # BaseStrategy, OrderIntent, FillEvent, MarketEvent
│   │   ├── risk.py                           # Pre-trade sizing, leverage caps, liquidation buffers, kill-switch
│   │   ├── watchdog.py                       # Executable Desync Watchdog with automatic unwind logic
│   │   └── executor.py                       # Strategy-agnostic execution engine and order router
│   ├── connectors/
│   │   ├── __init__.py
│   │   ├── base.py                           # Abstract exchange connector interface
│   │   ├── binance.py                        # Binance USD-M Futures Testnet connector
│   │   ├── bybit.py                          # Bybit V5 Linear Testnet connector
│   │   ├── delta_india.py                    # Delta India Testnet connector
│   │   └── paper_mock.py                     # Simulated Paper Execution Layer Fallback (for KuCoin/offline)
│   └── strategies/
│       ├── __init__.py
│       ├── idea_01_cash_and_carry.py         # Spot-Perp Cash-and-Carry strategy
│       ├── idea_02_rate_momentum.py          # Rate-Momentum Sizing strategy
│       ├── idea_03_cross_exchange.py         # Cross-Exchange Funding Spread Capture strategy
│       ├── idea_04_ml_prediction.py          # ML-Augmented Rate Prediction strategy
│       └── idea_rs_ou_mean_reversion.py      # Bounded Agent-Researched OU Mean Reversion strategy
├── docs/
│   ├── IDEAS.md                              # Backlog registry table
│   ├── PLAN_CHANGELOG.md                     # Append-only plan modifications
│   └── ideas/                                # Idea directory machine (/backlog, /audit, /approved, /paper, /resolved)
│       ├── idea-01-cash-and-carry/
│       ├── idea-02-rate-momentum/
│       ├── idea-03-cross-exchange-funding/
│       ├── idea-04-ml-rate-prediction/
│       └── idea-rs-ou-mean-reversion/
├── STATUS.md                                 # Session board, blocked items, proposals
├── MEMORY.md                                 # Append-only swarm decision log
└── tests/
    ├── __init__.py
    ├── conftest.py                           # Pytest fixtures, mock data, and test db setup
    ├── test_guardrails.py                    # Testnet assertions, risk caps, live switch tests
    ├── test_ipc_state_machine.py             # Directory transitions, memo validation, ledgers
    ├── test_swarm_pipeline.py                # Phases A-E handshakes, quorums, deadlocks, oath
    ├── test_market_feeds_regimes.py          # Exchange connectors, fee verification, 4 regimes
    ├── test_backtest_engine.py               # Custom backtester, fees, slippage, timing window
    ├── test_risk_and_watchdog.py             # Risk engine, desync watchdog unwinds, kill-switch
    ├── test_strategies.py                    # All 5 strategies logic and execution
    └── e2e/                                  # 4-Tier E2E Test Suite
        ├── test_tier1_features.py            # Tier 1: Feature Coverage (>=5 per feature)
        ├── test_tier2_boundaries.py          # Tier 2: Boundary & Corner Cases
        ├── test_tier3_combinations.py        # Tier 3: Cross-Feature Interactions
        └── test_tier4_workloads.py           # Tier 4: Real-World Workload Scenarios
```

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | The Swarm Oath (6 Rules) | Non-negotiable oath binding all agents before work; logs to `MEMORY.md` | M1 | Survey 1 §1 |
| 2 | Testnet-Only Assertion | Scans URIs for mainnet strings; halts instantly with alert if found | M1 | Survey 1 §4.2 |
| 3 | Risk-Cap Intake Assertion | Validates max DD, position size cap, leverage cap before `/audit` entry | M1 | Survey 1 §4.2 |
| 4 | "Arm for Live Trading" Switch | Custody with DELTA; defaults to False; inaccessible to agent tools | M1 | Survey 1 §4.2 |
| 5 | Reviewed-Code Assertion | Blocks unreviewed 3rd-party code from order/key paths; logs to `MEMORY.md` | M1 | Survey 1 §4.2 |
| 6 | SQLite Persistence Engine | 12 tables with WAL mode, busy timeout, foreign keys, index optimization | M1 | Survey 2 §4 |
| 7 | Standard Agent Memo Spec | 8-field markdown template; validation for veto failure scenario & remediation | M1 | Survey 1 §3.2 |
| 8 | 5-State Directory Machine | Controls `/backlog` -> `/audit` -> `/approved` -> `/paper` -> `/resolved` | M1 | Survey 1 §3.1 |
| 9 | Ledger Hierarchy | `STATUS.md`, `MEMORY.md`, `IDEAS.md`, `PLAN_CHANGELOG.md`, `DEBATE.md` | M1 | Survey 1 §3.3 |
| 10 | Agent Personas & Mandates | ALPHA (Velocity/Engine), BETA (Auditor/Veto), GAMMA (Quant), DELTA (State) | M2 | Survey 1 §2 |
| 11 | Phase A Handshake | Concept formalization (`CONCEPTS.md`); GAMMA lead, BETA challenge & sign-off | M2 | Survey 3 §2.1 |
| 12 | Phase B Handshake | Data feasibility (`DATA.md`); >=5 point fee/rate verification; GAMMA/DELTA/BETA | M2 | Survey 3 §2.2 |
| 13 | Phase C Handshake | Backtest engine audit (`BACKTEST.md`); 1 re-run rule; ALPHA/GAMMA/BETA | M2 | Survey 3 §2.3 |
| 14 | Phase D Handshake | Risk specification (`RISK.md`); sizing, leverage, watchdog; BETA/ALPHA/DELTA | M2 | Survey 3 §2.4 |
| 15 | Gate Decision Quorum | Unanimous 4-agent vote; >=2/4 regimes positive net expectancy; DD <= cap | M2 | Survey 3 §2.5 |
| 16 | Phase E Paper Trading | Testnet execution telemetry; 2-agent anomaly agreement triggers auto-pause | M2 | Survey 3 §2.6 |
| 17 | Adaptive Planning Loop | 2 tiers: Autonomous (proposer+cosigner) vs Overseer (guardrails/stack/caps) | M2 | Survey 1 §5 |
| 18 | Conflict Escalation Protocol | >2 round memo deadlock logged to `STATUS.md`; swarm branches to next idea | M2 | Survey 1 §5.3 |
| 19 | Exchange Connectors | Binance USD-M Futures, Bybit V5 Linear, Delta India REST/WS APIs | M3 | Survey 2 §1 |
| 20 | Simulated Paper Fallback | Orderbook VWAP matching, simulated latency, funding cashflow for offline venues | M3 | Survey 2 §1.4 |
| 21 | Fee Engineering & MVS | 4-way taker fee drag (0.200%), slippage buffer (0.100%), MVS hurdle (0.40%-0.50%) | M3 | Survey 2 §2 |
| 22 | 4 Historical Regimes | Bull Contango, Bear Backwardation, Choppy Rangebound, Structural Dispersion | M3 | Survey 2 §3 |
| 23 | Vectorized Backtest Engine | Discrete-event simulator; funding snapshot cash flows, realistic slippage | M3 | Survey 3 §2.3 |
| 24 | Idea 03 High-Fidelity Timing | T-8min entry / T+90s exit window, basis drift, stochastic leg fill latency | M3 | Survey 3 §3.1 |
| 25 | Lookahead Bias & Overfit Audit | Shift/index audit, purged cross-validation, and statistical sanity checks | M3 | Survey 3 §2.3 |
| 26 | Strategy-Agnostic Interface | `BaseStrategy`, `OrderIntent`, `FillEvent`, `MarketEvent`, `FundingSnapshotEvent` | M4 | Survey 3 §4.1 |
| 27 | Pre-Trade Risk Engine | Leverage enforcement, position sizing, liquidation distance buffer (>=35%) | M4 | Survey 3 §2.4 |
| 28 | Real-Time Desync Watchdog | Executable logic; 1500ms leg lag timer, auto-unwind/hedge on leg failure | M4 | Survey 3 §4.2 |
| 29 | Crash-Resistant Kill-Switch | SQLite state + `KILL_SWITCH.latch` file; refuses restart until Overseer unlock | M4 | Survey 3 §4.3 |
| 30 | Idea 03 Strategy Module | Cross-Exchange Funding Spread Capture implementation with dual-leg routing | M5 | Survey 3 §3.1 |
| 31 | Idea 01 Strategy Module | Spot-Perp Cash-and-Carry implementation with borrow cost modeling | M5 | Survey 3 §3.2 |
| 32 | Idea 02 Strategy Module | Rate-Momentum Sizing implementation with Z-score funding rate tilt | M5 | Survey 3 §3.3 |
| 33 | Idea 04 Strategy Module | ML-Augmented Rate Prediction with Orderbook Imbalance & Basis Acceleration | M5 | Survey 3 §3.4 |
| 34 | Agent Research Slot (RS) | OU Mean-Reversion Spread model formalization and screen by GAMMA | M5 | Survey 3 §3.5 |
| 35 | Full Pipeline Execution | Complete A->B->C->D->Gate->E traversal for Idea 03, and A->B trails for 01,02,04,RS | M5 | Survey 3 §1 |
| 36 | Swarm Review & Handoff | Final 4-agent signed review in `STATUS.md`, `MEMORY.md`, and handoff report | M5 | Survey 1 §7 |
| 37 | 4-Tier E2E Test Suite | Opaque-box requirements verification covering all 36 features across Tiers 1-4 | Final | Project Pattern |
| 38 | Forensic Integrity Verification | Static AST analysis, runtime tracing, and zero-mock validation by auditor | Final | Project Pattern |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Storage, IPC & Guardrails | SQLite DDL/migrations, Memo parser/validator, 5-state directory machine, ledgers, Testnet-only/Risk-cap/Live-switch guardrails | none | PLANNED |
| M2 | Swarm Protocol & Pipeline Handshakes | Personas (ALPHA, BETA, GAMMA, DELTA), Phases A-E pipeline engine, 4-agent quorum, deadlock escalation, Swarm Oath | M1 | PLANNED |
| M3 | Market Feeds, 4 Regimes & Backtest Engine | Exchange connectors (Binance, Bybit, Delta, Paper Mock), 4 regimes, 4-way fee model, vectorized backtester, Idea 03 timing engine | M1, M2 | PLANNED |
| M4 | Risk Engine, Desync Watchdog & Execution Engine | Strategy-agnostic execution engine, pre-trade risk checks, real-time desync watchdog, dual-persistence kill-switch | M1, M2, M3 | PLANNED |
| M5 | Seeded Backlog Pipeline & Swarm Handoff | Full pipeline run for Ideas 01-04 + RS (Idea 03 to Phase E, full paper trails for others), Swarm Review & Handoff | M1, M2, M3, M4 | PLANNED |
| Final | 100% E2E Test Suite & Adversarial Hardening | Complete 4-tier E2E test suite execution, adversarial edge case coverage, and clean Forensic Integrity Audit | M1, M2, M3, M4, M5 | PLANNED |

---

## Interface Contracts

### 1. Guardrail Validation Contract (`src.core.guardrails`)
```python
def assert_testnet_url(url: str) -> None:
    """Raises MainnetEndpointDetectedException if URL is a known mainnet endpoint."""

def assert_risk_caps(caps: dict) -> None:
    """Raises InvalidRiskCapsException if max_drawdown_pct, position_size_cap_usd, or leverage_cap are missing/invalid."""

def assert_live_switch_locked(is_live: bool) -> None:
    """Raises LiveTradingForbiddenException if is_live is True."""
```

### 2. IPC & Memo Contract (`src.ipc.memo` & `src.ipc.state_machine`)
```python
class AgentMemo:
    memo_id: str
    from_agent: str
    to_agent: str
    re_topic: str
    position: str  # 'approve', 'veto', 'request-info', 'propose'
    evidence: str
    failure_scenario: Optional[str]
    remediation: Optional[str]
    signature: str

class IdeaStateMachine:
    def transition(self, idea_id: str, target_state: str, memos: list[AgentMemo]) -> bool:
        """Enforces signature requirements for state transitions; rolls back if invalid."""
```

### 3. Strategy & Execution Contract (`src.engine.interfaces`)
```python
class BaseStrategy(ABC):
    def initialize(self, config: dict) -> None: ...
    def on_market_event(self, event: MarketEvent) -> list[OrderIntent]: ...
    def on_funding_snapshot(self, event: FundingSnapshotEvent) -> list[OrderIntent]: ...
    def on_fill(self, event: FillEvent) -> None: ...
    def on_desync_alert(self, pair_trade_id: str, context: dict) -> list[OrderIntent]: ...
```

### 4. Desync Watchdog Contract (`src.engine.watchdog`)
```python
class DesyncWatchdog:
    async def register_pair(self, pair_id: str, leg1_intent: dict, leg2_intent: dict) -> None: ...
    async def on_leg_fill(self, pair_id: str, fill_event: dict) -> None: ...
    async def trigger_emergency_unwind(self, tracker: PairedExecutionTracker, reason: str) -> None: ...
```

### 5. Backtest Engine Contract (`src.backtest.engine`)
```python
class FundingBacktester:
    def run_regime(self, strategy: BaseStrategy, regime_id: str, data: pd.DataFrame) -> BacktestResult:
        """Simulates discrete-event execution across 8h funding settlements with fee & slippage modeling."""
```
