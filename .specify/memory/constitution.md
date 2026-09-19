# Spec Kit Constitution: SmartTrading-V2

## Product Intent
Full-stack interactive web trading terminal with WebGL candlestick canvas, LuxAlgo indicators suite, Pine Script executor, reactive multi-timeframe dashboard, and live CCXT crypto feeds.

## Architectural Invariants
- Zero Blast-Radius: Isolated sandbox execution per task.
- Strict TDD: BDD acceptance tests frozen before code development.
- Clean Code & Deterministic Verification: Sole oracle is test runner exit code == 0.
