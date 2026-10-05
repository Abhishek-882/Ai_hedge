# PHASE A: CONCEPT FORMALIZATION — idea-01-cash-and-carry

## 1. Payoff Mechanics & Derivation
```
APY_carry = sum(FR_8h) - (SpotFee + PerpFee)*(365/HoldingDays) - r_borrow
```

## 2. Delta-Neutrality Definition & Proof
S_spot + S_perp = 0.0 => Net Delta is exactly 0 across spot and short perpetual.

## 3. Residual Risk Inventory
- Margin Collateral Liquidation Risk on Perpetual Short during violent spot rallies without portfolio margin.
- Borrow Interest Rate Spike Risk (r_borrow) in negative carry regimes eroding yield.
- Spot-Perp Basis Compression reducing annualized return below capital hurdle.
- Spot Withdrawal / Custody Friction between spot and futures sub-wallets.

## 4. Sign-offs
- **GAMMA**: `GAMMA — 2026-08-28T14:52:28.651084+00:00 — git:m5-exec-2026`
- **BETA**: `BETA — 2026-08-28T14:52:28.651084+00:00 — git:m5-exec-2026`
