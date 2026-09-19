# Architectural Blueprint & System Design: SmartTrading-V2

## 1. System Intent
Full-stack interactive web trading terminal with WebGL candlestick canvas, LuxAlgo indicators suite, Pine Script executor, reactive multi-timeframe dashboard, and live CCXT crypto feeds.

## 2. Core Modules & Boundaries
- **Data Flow:** Unidirectional pipeline managed via StateGraph.
- **Isolation:** Task sandboxes run with zero blast-radius on host.
- **Deterministic Oracle:** Verification oracle relies strictly on numeric test exit codes.

## 3. Security & Quality Invariants
- Clean code adherence with automated linting.
- BDD test specifications frozen before code generation.
- Automated GitHub Spec Kit alignment in `.specify/`.

## 4. Provenance
Built autonomously by Nexus Agent Graph for Hossein Mohammadi (98H).
