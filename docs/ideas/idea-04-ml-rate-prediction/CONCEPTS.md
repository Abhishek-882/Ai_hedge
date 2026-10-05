# PHASE A: CONCEPT FORMALIZATION — idea-04-ml-rate-prediction

## 1. Payoff Mechanics & Derivation
```
FR_hat_{t+8h} = f(OBI, Basis_vel, Basis_accel, Delta_OI, Taker_Ratio, Cross_Dispersion)
```

## 2. Delta-Neutrality Definition & Proof
Predictive Sizing Model: Pre-positions capital in advance of funding rate fixes when expected drift exceeds hurdle.

## 3. Residual Risk Inventory
- Model Overfitting / Feature Collinearity on historical funding regimes.
- Structural Regime Shifts rendering historical linear feature weights sub-optimal.
- Execution Latency in front-running public 8h settlement fixings.

## 4. Sign-offs
- **GAMMA**: `GAMMA — 2026-08-28T14:52:28.651084+00:00 — git:m5-exec-2026`
- **BETA**: `BETA — 2026-08-28T14:52:28.651084+00:00 — git:m5-exec-2026`
