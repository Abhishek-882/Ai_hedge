# PHASE A: CONCEPT FORMALIZATION — idea-03-cross-exchange-funding

## 1. Payoff Mechanics & Derivation
```
Phi_net = N * [(FR_H - FR_L) - 0.0020 (FeeDrag) - 0.0010 (Slippage) + DeltaBasis]
```

## 2. Delta-Neutrality Definition & Proof
N_L = Q_L * P_L = N_H = Q_H * P_H = target_notional / 2 => Net Delta = N_L - N_H = 0.0

## 3. Residual Risk Inventory
- Basis Risk: Divergence between venue A and venue B perp prices during 9.5-minute holding interval.
- Execution Timing Risk: Stochastic fill latency skew (40ms-350ms) causing momentary unhedged delta exposure.
- Funding Settlement Asynchrony: Timestamp discrepancies across venues or differing funding intervals.
- Exchange Outage / Disconnect: Single venue drops websocket feed leaving open leg unhedged.
- Auto-Deleveraging (ADL) / Liquidation Cascades: Extreme market moves triggering unhedged directional tail risk.

## 4. Sign-offs
- **GAMMA**: `GAMMA — 2026-08-28T14:52:28.651084+00:00 — git:m5-exec-2026`
- **BETA**: `BETA — 2026-08-28T14:52:28.651084+00:00 — git:m5-exec-2026`
