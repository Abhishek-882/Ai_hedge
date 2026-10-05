# PHASE A: CONCEPT FORMALIZATION — idea-02-rate-momentum

## 1. Payoff Mechanics & Derivation
```
R_directional = S_tilted * (Delta P / P), where S_tilted = S_base * clip(1.0 - gamma * Z_FR(t), 0.2, 2.0)
```

## 2. Delta-Neutrality Definition & Proof
Directional Strategy: Net Delta != 0; exposure dynamically scaled with anti-crowding protections.

## 3. Residual Risk Inventory
- Trend Whipsaw / False Breakout Risk causing directional stop-loss triggers.
- Funding Squeeze / Regime Transition Delay where crowded funding persists against technical trend.
- Execution Slippage on Dynamic Size Rebalancing during high-volatility spikes.

## 4. Sign-offs
- **GAMMA**: `GAMMA — 2026-08-28T14:52:28.651084+00:00 — git:m5-exec-2026`
- **BETA**: `BETA — 2026-08-28T14:52:28.651084+00:00 — git:m5-exec-2026`
