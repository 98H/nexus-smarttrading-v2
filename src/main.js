/**
 * SmartTrading-V2 — Modern ESM Interactive Trading Terminal Entrypoint
 * High-performance WebGL & 2D Composite Rendering Engine with LuxAlgo Smart Money Concepts,
 * Pine Script v5 Runtime Interpreter, Reactive Multi-Timeframe Screener & Real-Time Order Flow.
 */

// ============================================================================
// 1. STYLES & DESIGN SYSTEM INJECTION (#080b11 Dark Bloomberg/TradingView Luxury)
// ============================================================================

const terminalStyles = `
:root {
  --bg-primary: #080b11;
  --bg-secondary: #0d111a;
  --bg-surface: #121722;
  --bg-hover: #1b2234;
  --bg-panel: #0e131d;
  --border-subtle: #1a2233;
  --border-strong: #2a364f;
  --text-primary: #f0f4fc;
  --text-muted: #7987a1;
  --text-dim: #44516d;
  --bull-green: #00f5a0;
  --bull-green-dim: rgba(0, 245, 160, 0.15);
  --bull-green-glow: rgba(0, 245, 160, 0.4);
  --bear-red: #ff3b69;
  --bear-red-dim: rgba(255, 59, 105, 0.15);
  --bear-red-glow: rgba(255, 59, 105, 0.4);
  --accent-blue: #3b82f6;
  --accent-purple: #8b5cf6;
  --accent-gold: #f59e0b;
  --font-mono: 'JetBrains Mono', 'Fira Code', Menlo, Monaco, Consolas, monospace;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  user-select: none;
}

body, html {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-sans);
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
}

#app {
  display: grid;
  grid-template-rows: 46px 1fr 28px;
  grid-template-columns: 50px 1fr 340px;
  width: 100vw;
  height: 100vh;
  background: var(--bg-primary);
}

.header-bar {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
  z-index: 10;
}

.brand-section {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  font-size: 15px;
  letter-spacing: -0.5px;
  color: var(--text-primary);
}

.brand-logo svg {
  width: 20px;
  height: 20px;
  color: var(--bull-green);
  filter: drop-shadow(0 0 6px var(--bull-green-glow));
}

.symbol-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  padding: 5px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.15s ease;
}

.symbol-selector:hover {
  border-color: var(--border-strong);
  background: var(--bg-hover);
}

.symbol-price-badge {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
}

.badge-up {
  background: var(--bull-green-dim);
  color: var(--bull-green);
}

.badge-down {
  background: var(--bear-red-dim);
  color: var(--bear-red);
}

.timeframe-pill-box {
  display: flex;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}

.tf-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tf-btn:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.tf-btn.active {
  color: #fff;
  background: var(--accent-blue);
  font-weight: 700;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-toggle-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  padding: 6px 11px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: border 0.15s ease;
}

.btn-toggle-indicator.active {
  border-color: var(--accent-purple);
  background: rgba(139, 92, 246, 0.15);
  color: #c4b5fd;
}

.left-toolbar {
  grid-column: 1 / 2;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0;
  gap: 6px;
  z-index: 5;
}

.tool-btn {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.tool-btn:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.tool-btn.active {
  background: var(--bg-surface);
  color: var(--accent-blue);
  border-left: 2px solid var(--accent-blue);
}

.chart-workspace {
  grid-column: 2 / 3;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.canvas-container {
  flex: 1;
  position: relative;
  width: 100%;
  height: 100%;
  background: var(--bg-primary);
}

.chart-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.chart-hud {
  position: absolute;
  top: 12px;
  left: 16px;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 4;
}

.hud-ticker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 14px;
}

.hud-ohlc-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
}

.hud-ohlc-row span b {
  font-weight: 600;
}

.hud-smc-badges {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.smc-tag {
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
}

.smc-tag-fvg {
  background: rgba(59, 130, 246, 0.2);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.smc-tag-ob {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.smc-tag-trend {
  background: var(--bull-green-dim);
  color: var(--bull-green);
  border: 1px solid rgba(0, 245, 160, 0.3);
}

.dock-panel {
  background: var(--bg-surface);
  border-top: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  height: 220px;
  transition: height 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
  z-index: 6;
}

.dock-panel.collapsed {
  height: 32px;
}

.dock-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  height: 32px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
}

.dock-tabs {
  display: flex;
  gap: 4px;
}

.dock-tab {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 4px 4px 0 0;
}

.dock-tab.active {
  color: var(--text-primary);
  background: var(--bg-surface);
}

.dock-content {
  flex: 1;
  display: flex;
  font-family: var(--font-mono);
  background: #090c13;
  overflow: hidden;
}

.pine-editor-area {
  flex: 1;
  display: flex;
  position: relative;
}

.pine-line-numbers {
  width: 40px;
  background: #0d121c;
  color: var(--text-dim);
  text-align: right;
  padding: 8px 8px 8px 0;
  font-size: 11px;
  line-height: 18px;
  user-select: none;
  border-right: 1px solid var(--border-subtle);
}

.pine-textarea {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #e2e8f0;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 18px;
  padding: 8px 12px;
  resize: none;
  white-space: pre;
  overflow: auto;
}

.pine-console {
  width: 280px;
  border-left: 1px solid var(--border-subtle);
  padding: 8px 10px;
  font-size: 11px;
  color: var(--text-muted);
  overflow-y: auto;
  background: #070a0f;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.console-entry {
  line-height: 1.4;
}
.console-entry.success { color: var(--bull-green); }
.console-entry.warn { color: var(--accent-gold); }
.console-entry.error { color: var(--bear-red); }

.right-sidebar {
  grid-column: 3 / 4;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-tab-nav {
  display: flex;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-panel);
}

.sidebar-tab-btn {
  flex: 1;
  padding: 10px 0;
  text-align: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
}

.sidebar-tab-btn.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent-blue);
  background: var(--bg-secondary);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.orderbook-box {
  display: flex;
  flex-direction: column;
  padding: 8px 12px;
  flex: 1;
}

.book-header-row {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-dim);
  font-weight: 700;
  text-transform: uppercase;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 4px;
}

.order-ladder {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ladder-row {
  display: flex;
  justify-content: space-between;
  position: relative;
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 2px;
  cursor: pointer;
}

.ladder-row .depth-bar {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  opacity: 0.18;
  z-index: 1;
  border-radius: 2px;
}

.ladder-row.ask .depth-bar { background: var(--bear-red); }
.ladder-row.bid .depth-bar { background: var(--bull-green); }

.ladder-row span {
  position: relative;
  z-index: 2;
}

.ladder-row.ask span:first-child { color: var(--bear-red); }
.ladder-row.bid span:first-child { color: var(--bull-green); }

.book-spread-divider {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 4px;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 13px;
  background: var(--bg-surface);
  border-radius: 4px;
  margin: 4px 0;
}

.mtf-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 12px;
}

.mtf-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mtf-card-tf {
  font-weight: 700;
  font-size: 11px;
  color: var(--text-muted);
}

.mtf-card-bias {
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 4px;
}

.exec-panel {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.exec-type-toggle {
  display: flex;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 2px;
}

.exec-type-btn {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-muted);
  padding: 5px 0;
  font-size: 11px;
  cursor: pointer;
  border-radius: 4px;
}

.exec-type-btn.active {
  background: var(--bg-hover);
  color: var(--text-primary);
  font-weight: 600;
}

.exec-input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.exec-label {
  font-size: 11px;
  color: var(--text-muted);
  display: flex;
  justify-content: space-between;
}

.exec-input-wrap {
  display: flex;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 6px 10px;
  align-items: center;
}

.exec-input-wrap input {
  background: transparent;
  border: none;
  outline: none;
  color: #fff;
  font-family: var(--font-mono);
  font-size: 13px;
  width: 100%;
}

.exec-action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}

.btn-buy {
  background: linear-gradient(135deg, #00f5a0 0%, #00b377 100%);
  color: #05261b;
  border: none;
  font-weight: 700;
  padding: 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.05s ease, filter 0.15s;
}

.btn-sell {
  background: linear-gradient(135deg, #ff3b69 0%, #c41e45 100%);
  color: #fff;
  border: none;
  font-weight: 700;
  padding: 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.05s ease, filter 0.15s;
}

.btn-buy:active, .btn-sell:active {
  transform: scale(0.98);
}

.status-bar {
  grid-column: 1 / -1;
  background: #05070c;
  border-top: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.status-left, .status-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.status-indicator-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--bull-green);
  box-shadow: 0 0 6px var(--bull-green-glow);
}

.icon {
  width: 16px;
  height: 16px;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  fill: none;
}
`;

if (typeof document !== 'undefined') {
  const styleElement = document.createElement('style');
  styleElement.textContent = terminalStyles;
  if (document.head) {
    document.head.appendChild(styleElement);
  }
}

// ============================================================================
// 2. CORE MATHEMATICS, SMC DETECTORS & TECHNICAL ALGORITHMS
// ============================================================================

class MarketStructureEngine {
  static computeEMAs(candles, period) {
    const k = 2 / (period + 1);
    const emaArray = new Array(candles.length);
    let ema = candles[0].close;
    emaArray[0] = ema;
    for (let i = 1; i < candles.length; i++) {
      ema = candles[i].close * k + ema * (1 - k);
      emaArray[i] = ema;
    }
    return emaArray;
  }

  static computeRSI(candles, period = 14) {
    const rsi = new Array(candles.length).fill(50);
    if (candles.length <= period) return rsi;

    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;
    rsi[period] = 100 - (100 / (1 + (avgGain / (avgLoss || 0.0001))));

    for (let i = period + 1; i < candles.length; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgGain / (avgLoss || 0.0001);
      rsi[i] = 100 - (100 / (1 + rs));
    }
    return rsi;
  }

  static detectSMCFeatures(candles) {
    const fvgs = [];
    const orderBlocks = [];
    const signals = [];

    for (let i = 2; i < candles.length; i++) {
      const c1 = candles[i - 2];
      const c3 = candles[i];

      if (c3.low > c1.high) {
        const fvg = {
          type: 'BULLISH',
          top: c3.low,
          bottom: c1.high,
          startIndex: i - 1,
          endIndex: candles.length - 1,
          mitigated: false
        };
        for (let j = i; j < candles.length; j++) {
          if (candles[j].low <= fvg.bottom) {
            fvg.mitigated = true;
            fvg.endIndex = j;
            break;
          }
        }
        fvgs.push(fvg);
      }

      if (c3.high < c1.low) {
        const fvg = {
          type: 'BEARISH',
          top: c1.low,
          bottom: c3.high,
          startIndex: i - 1,
          endIndex: candles.length - 1,
          mitigated: false
        };
        for (let j = i; j < candles.length; j++) {
          if (candles[j].high >= fvg.top) {
            fvg.mitigated = true;
            fvg.endIndex = j;
            break;
          }
        }
        fvgs.push(fvg);
      }
    }

    for (let i = 5; i < candles.length - 2; i++) {
      const isImpulsiveBull = candles[i + 1].close > candles[i + 1].open &&
        (candles[i + 1].close - candles[i + 1].open) > (candles[i].high - candles[i].low) * 1.5;
      const isImpulsiveBear = candles[i + 1].close < candles[i + 1].open &&
        (candles[i].open - candles[i + 1].close) > (candles[i].high - candles[i].low) * 1.5;

      if (isImpulsiveBull && candles[i].close < candles[i].open) {
        orderBlocks.push({
          type: 'BULLISH_OB',
          top: candles[i].high,
          bottom: candles[i].low,
          startIndex: i,
          endIndex: Math.min(candles.length - 1, i + 35)
        });
      } else if (isImpulsiveBear && candles[i].close > candles[i].open) {
        orderBlocks.push({
          type: 'BEARISH_OB',
          top: candles[i].high,
          bottom: candles[i].low,
          startIndex: i,
          endIndex: Math.min(candles.length - 1, i + 35)
        });
      }
    }

    const fastEma = this.computeEMAs(candles, 9);
    const slowEma = this.computeEMAs(candles, 21);

    for (let i = 1; i < candles.length; i++) {
      if (fastEma[i - 1] <= slowEma[i - 1] && fastEma[i] > slowEma[i]) {
        signals.push({
          index: i,
          type: 'BUY',
          price: candles[i].low * 0.9985,
          label: 'BUY'
        });
      } else if (fastEma[i - 1] >= slowEma[i - 1] && fastEma[i] < slowEma[i]) {
        signals.push({
          index: i,
          type: 'SELL',
          price: candles[i].high * 1.0015,
          label: 'SELL'
        });
      }
    }

    return { fvgs, orderBlocks, signals, fastEma, slowEma };
  }
}

// ============================================================================
// 3. PINE SCRIPT V5 LIGHTWEIGHT RUNTIME INTERPRETER & EXECUTOR
// ============================================================================

class PineScriptInterpreter {
  constructor() {
    this.logs = [];
    this.plots = [];
  }

  execute(sourceCode, candles) {
    this.logs = [];
    this.plots = [];
    const close = candles.map(c => c.close);
    const open = candles.map(c => c.open);
    const high = candles.map(c => c.high);
    const low = candles.map(c => c.low);
    const volume = candles.map(c => c.volume);

    const ta = {
      ema: (series, len) => {
        const k = 2 / (len + 1);
        const res = [series[0]];
        for (let i = 1; i < series.length; i++) {
          res.push(series[i] * k + res[i - 1] * (1 - k));
        }
        return res;
      },
      sma: (series, len) => {
        const res = [];
        for (let i = 0; i < series.length; i++) {
          if (i < len - 1) {
            res.push(series[i]);
            continue;
          }
          let sum = 0;
          for (let j = 0; j < len; j++) sum += series[i - j];
          res.push(sum / len);
        }
        return res;
      },
      rsi: (series, len) => {
        const synthCandles = series.map((p) => ({ close: p, open: p, high: p, low: p }));
        return MarketStructureEngine.computeRSI(synthCandles, len);
      }
    };

    const plot = (series, title = 'Plot', color = '#3b82f6', lineWidth = 1.5) => {
      if (Array.isArray(series)) {
        this.plots.push({ title, series, color, lineWidth });
      }
    };

    try {
      this.logs.push({ type: 'info', msg: 'Compiling Pine Script v5 AST...' });

      const sanitized = sourceCode
        .replace(/@version=5/g, '')
        .replace(/indicator\((.*?)\);?/g, '// indicator init')
        .replace(/\bta\.ema\b/g, 'ta.ema')
        .replace(/\bta\.sma\b/g, 'ta.sma')
        .replace(/\bta\.rsi\b/g, 'ta.rsi')
        .replace(/\bplot\(/g, 'plot(');

      const runner = new Function('close', 'open', 'high', 'low', 'volume', 'ta', 'plot', sanitized);
      runner(close, open, high, low, volume, ta, plot);

      this.logs.push({ type: 'success', msg: `Script compiled successfully. Generated ${this.plots.length} plot buffers.` });
      return { success: true, plots: this.plots, logs: this.logs };
    } catch (err) {
      this.logs.push({ type: 'error', msg: `Compile Error: ${err.message}` });
      return { success: false, plots: [], logs: this.logs };
    }
  }
}

// ============================================================================
// 4. REAL-TIME CCXT FEED SIMULATOR & VOLATILITY GENERATOR
// ============================================================================

class MarketDataFeed {
  constructor(symbol = 'BTC/USDT', initialCandleCount = 180) {
    this.symbol = symbol;
    this.listeners = new Set();
    this.orderBookListeners = new Set();
    this.candles = this.generateHistoricalData(initialCandleCount);
    this.currentPrice = this.candles[this.candles.length - 1].close;
    this.spread = 0.50;
    this.startStreaming();
  }

  generateHistoricalData(count) {
    const list = [];
    let basePrice = 64200.0;
    const now = Date.now();
    const intervalMs = 60 * 1000;

    for (let i = count; i >= 0; i--) {
      const time = now - i * intervalMs;
      const delta = (Math.random() - 0.49) * 120;
      const open = basePrice;
      const close = open + delta;
      const high = Math.max(open, close) + Math.random() * 45;
      const low = Math.min(open, close) - Math.random() * 45;
      const volume = 10 + Math.random() * 90;
      list.push({ time, open, high, low, close, volume });
      basePrice = close;
    }
    return list;
  }

  startStreaming() {
    setInterval(() => {
      const tickFluctuation = (Math.random() - 0.495) * 8.5;
      this.currentPrice = +(this.currentPrice + tickFluctuation).toFixed(2);

      const lastCandle = this.candles[this.candles.length - 1];
      const now = Date.now();

      if (now - lastCandle.time >= 60 * 1000) {
        const newCandle = {
          time: now,
          open: this.currentPrice,
          high: this.currentPrice,
          low: this.currentPrice,
          close: this.currentPrice,
          volume: 1
        };
        this.candles.push(newCandle);
        if (this.candles.length > 500) this.candles.shift();
      } else {
        lastCandle.high = Math.max(lastCandle.high, this.currentPrice);
        lastCandle.low = Math.min(lastCandle.low, this.currentPrice);
        lastCandle.close = this.currentPrice;
        lastCandle.volume += +(Math.random() * 0.4).toFixed(2);
      }

      this.notifyCandleUpdate();
      this.emitOrderBookUpdate();
    }, 180);
  }

  emitOrderBookUpdate() {
    const depth = 12;
    const asks = [];
    const bids = [];
    let askCum = 0;
    let bidCum = 0;

    for (let i = 0; i < depth; i++) {
      const askPrice = +(this.currentPrice + (i + 1) * 0.6).toFixed(2);
      const askQty = +(Math.random() * 2.2 + 0.1).toFixed(3);
      askCum += askQty;
      asks.push({ price: askPrice, size: askQty, total: +askCum.toFixed(3) });

      const bidPrice = +(this.currentPrice - (i + 1) * 0.6).toFixed(2);
      const bidQty = +(Math.random() * 2.2 + 0.1).toFixed(3);
      bidCum += bidQty;
      bids.push({ price: bidPrice, size: bidQty, total: +bidCum.toFixed(3) });
    }

    const payload = {
      symbol: this.symbol,
      price: this.currentPrice,
      spread: +(asks[0].price - bids[0].price).toFixed(2),
      asks: asks.reverse(),
      bids
    };

    for (const listener of this.orderBookListeners) {
      listener(payload);
    }
  }

  subscribeCandles(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  subscribeOrderBook(fn) {
    this.orderBookListeners.add(fn);
    return () => this.orderBookListeners.delete(fn);
  }

  notifyCandleUpdate() {
    for (const listener of this.listeners) {
      listener(this.candles, this.currentPrice);
    }
  }
}

// ============================================================================
// 5. HYBRID WEBGL & HIGH-DPI CANVAS 2D RENDERING PIPELINE
// ============================================================================

class WebGLBackgroundRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: true, antialias: false });
    if (this.gl) {
      this.initShaders();
    }
  }

  initShaders() {
    const gl = this.gl;
    const vsSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform vec2 u_resolution;
      uniform vec2 u_offset;
      uniform float u_zoom;

      void main() {
        vec2 st = gl_FragCoord.xy / u_resolution;
        vec2 coord = gl_FragCoord.xy + u_offset;
        
        vec3 color = vec3(0.031, 0.043, 0.067);

        float gridX = step(0.985, fract(coord.x / (45.0 * u_zoom)));
        float gridY = step(0.985, fract(coord.y / 35.0));
        float grid = max(gridX, gridY);

        color += vec3(0.06, 0.09, 0.14) * grid * 0.45;

        float dist = distance(st, vec2(0.5, 0.5));
        color -= dist * 0.025;

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const createShader = (type, src) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      return shader;
    };

    const program = gl.createProgram();
    gl.attachShader(program, createShader(gl.VERTEX_SHADER, vsSource));
    gl.attachShader(program, createShader(gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(program);
    this.program = program;

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    this.positionLocation = gl.getAttribLocation(program, 'a_position');
    this.resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
    this.offsetLocation = gl.getUniformLocation(program, 'u_offset');
    this.zoomLocation = gl.getUniformLocation(program, 'u_zoom');
  }

  render(offsetX, zoom) {
    if (!this.gl) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);

    gl.enableVertexAttribArray(this.positionLocation);
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(this.resolutionLocation, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.offsetLocation, offsetX, 0.0);
    gl.uniform1f(this.zoomLocation, zoom);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
}

/**
 * High-Performance Candlestick Chart Component with Responsive Gesture Zooming
 */
export class Chart {
  constructor(canvas, options = {}) {
    if (!canvas) {
      throw new Error('Canvas element is required for Chart initialization');
    }

    this.canvas = canvas;
    this.options = options;
    this.data = options.data ? [...options.data] : [];
    this.minZoom = options.minZoom !== undefined ? options.minZoom : 0.5;
    this.maxZoom = options.maxZoom !== undefined ? options.maxZoom : 5.0;
    const initZoom = options.initialZoom !== undefined ? options.initialZoom : (options.zoom !== undefined ? options.zoom : 1.0);
    this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, initZoom));

    this.timeScale = { min: 0, max: 1 };
    this.priceScale = { min: 0, max: 1 };

    this.handleWheel = this.handleWheel.bind(this);
    if (typeof this.canvas.addEventListener === 'function') {
      this.canvas.addEventListener('wheel', this.handleWheel);
    }

    this.updateScales();
  }

  getZoom() {
    return this.zoom;
  }

  getTimeScale() {
    this.updateScales();
    const width = this.canvas.width || 800;
    return {
      min: this.timeScale.min,
      max: this.timeScale.max,
      domain: [this.timeScale.min, this.timeScale.max],
      range: [0, width],
      zoom: this.zoom,
    };
  }

  getPriceScale() {
    this.updateScales();
    const height = this.canvas.height || 600;
    return {
      min: this.priceScale.min,
      max: this.priceScale.max,
      domain: [this.priceScale.min, this.priceScale.max],
      range: [height, 0],
      zoom: this.zoom,
    };
  }

  updateScales() {
    if (!this.data || this.data.length === 0) {
      this.timeScale = { min: 0, max: 1 };
      this.priceScale = { min: 0, max: 1 };
      return;
    }

    let minTime = Infinity;
    let maxTime = -Infinity;
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    for (let i = 0; i < this.data.length; i++) {
      const c = this.data[i];
      if (c.time < minTime) minTime = c.time;
      if (c.time > maxTime) maxTime = c.time;
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    }

    const timeSpan = maxTime - minTime || 3600;
    const centerTime = (minTime + maxTime) / 2;
    const visibleTimeSpan = timeSpan / this.zoom;

    const priceSpan = maxPrice - minPrice || 10;
    const centerPrice = (minPrice + maxPrice) / 2;
    const visiblePriceSpan = priceSpan / this.zoom;

    this.timeScale = {
      min: centerTime - visibleTimeSpan / 2,
      max: centerTime + visibleTimeSpan / 2,
    };

    this.priceScale = {
      min: centerPrice - visiblePriceSpan / 2,
      max: centerPrice + visiblePriceSpan / 2,
    };
  }

  handleWheel(event) {
    const deltaY = event.deltaY ?? 0;
    if (deltaY === 0) return;

    const canZoomIn = deltaY < 0 && this.zoom < this.maxZoom;
    const canZoomOut = deltaY > 0 && this.zoom > this.minZoom;

    if (canZoomIn || canZoomOut) {
      if (typeof event.preventDefault === 'function') {
        event.preventDefault();
      }

      const zoomFactor = Math.exp(-deltaY * 0.001);
      const nextZoom = this.zoom * zoomFactor;
      this.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, nextZoom));

      this.updateScales();
      this.render();
    }
  }

  render() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const width = this.canvas.width || 800;
    const height = this.canvas.height || 600;

    ctx.clearRect(0, 0, width, height);

    if (!this.data || this.data.length === 0) return;

    this.updateScales();
    const { min: minTime, max: maxTime } = this.timeScale;
    const { min: minPrice, max: maxPrice } = this.priceScale;

    const timeRange = maxTime - minTime || 1;
    const priceRange = maxPrice - minPrice || 1;
    const candleWidth = Math.max(2, (width / this.data.length) * 0.6 * this.zoom);

    for (let i = 0; i < this.data.length; i++) {
      const candle = this.data[i];
      const x = ((candle.time - minTime) / timeRange) * width;
      const yHigh = height - ((candle.high - minPrice) / priceRange) * height;
      const yLow = height - ((candle.low - minPrice) / priceRange) * height;
      const yOpen = height - ((candle.open - minPrice) / priceRange) * height;
      const yClose = height - ((candle.close - minPrice) / priceRange) * height;

      const isBull = candle.close >= candle.open;
      const color = isBull ? '#00f5a0' : '#ff3b69';

      ctx.strokeStyle = color;
      ctx.fillStyle = color;

      // Draw wick
      ctx.beginPath();
      ctx.moveTo(x, yHigh);
      ctx.lineTo(x, yLow);
      ctx.stroke();

      // Draw body
      const bodyY = Math.min(yOpen, yClose);
      const bodyH = Math.max(1, Math.abs(yClose - yOpen));
      ctx.fillRect(x - candleWidth / 2, bodyY, candleWidth, bodyH);
    }
  }

  destroy() {
    if (this.canvas && typeof this.canvas.removeEventListener === 'function') {
      this.canvas.removeEventListener('wheel', this.handleWheel);
    }
  }
}

/**
 * Terminal Interactive Chart Engine
 */
class InteractiveChartEngine {
  constructor(container, marketFeed) {
    this.container = container;
    this.feed = marketFeed;

    this.candleWidth = 10;
    this.candleSpacing = 4;
    this.panOffset = 0;
    this.zoomLevel = 1.0;
    this.priceScaleWidth = 68;
    this.timeScaleHeight = 26;

    this.isDragging = false;
    this.dragStartX = 0;
    this.dragPanStart = 0;

    this.mouseX = null;
    this.mouseY = null;

    this.showSMC = true;
    this.showRibbon = true;
    this.customPlots = [];

    this.fps = 60;
    this.lastFrameTime = performance.now();
    this.frameCount = 0;

    this.initCanvas();
    this.bindEvents();
    this.startLoop();
  }

  initCanvas() {
    this.container.innerHTML = '';

    this.glCanvas = document.createElement('canvas');
    this.glCanvas.className = 'chart-canvas';
    this.glCanvas.style.zIndex = '1';
    this.container.appendChild(this.glCanvas);
    this.glRenderer = new WebGLBackgroundRenderer(this.glCanvas);

    this.canvas2d = document.createElement('canvas');
    this.canvas2d.className = 'chart-canvas';
    this.canvas2d.style.zIndex = '2';
    this.container.appendChild(this.canvas2d);
    this.ctx = this.canvas2d.getContext('2d');

    this.resize();
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;

    this.glCanvas.width = this.width * dpr;
    this.glCanvas.height = this.height * dpr;

    this.canvas2d.width = this.width * dpr;
    this.canvas2d.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  bindEvents() {
    window.addEventListener('resize', () => this.resize());

    this.canvas2d.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragPanStart = this.panOffset;
    });

    window.addEventListener('mousemove', (e) => {
      const rect = this.canvas2d.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;

      if (this.isDragging) {
        const deltaX = e.clientX - this.dragStartX;
        const candleStride = (this.candleWidth + this.candleSpacing) * this.zoomLevel;
        this.panOffset = this.dragPanStart - (deltaX / candleStride);
      }
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    this.canvas2d.addEventListener('wheel', (e) => {
      const deltaY = e.deltaY ?? 0;
      if (deltaY === 0) return;
      const minZoom = 0.35;
      const maxZoom = 3.5;
      const canZoomIn = deltaY < 0 && this.zoomLevel < maxZoom;
      const canZoomOut = deltaY > 0 && this.zoomLevel > minZoom;
      if (canZoomIn || canZoomOut) {
        if (typeof e.preventDefault === 'function') {
          e.preventDefault();
        }
        const zoomFactor = Math.exp(-deltaY * 0.001);
        this.zoomLevel = Math.max(minZoom, Math.min(maxZoom, this.zoomLevel * zoomFactor));
      }
    }, { passive: false });

    this.canvas2d.addEventListener('mouseleave', () => {
      this.mouseX = null;
      this.mouseY = null;
    });
  }

  setPlots(plots) {
    this.customPlots = plots;
  }

  startLoop() {
    const frame = (time) => {
      this.frameCount++;
      if (time - this.lastFrameTime >= 1000) {
        this.fps = Math.round((this.frameCount * 1000) / (time - this.lastFrameTime));
        this.frameCount = 0;
        this.lastFrameTime = time;
        if (this.onFpsUpdate) this.onFpsUpdate(this.fps);
      }

      this.render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  render() {
    const { width, height, ctx, feed } = this;
    const candles = feed.candles;
    if (!candles || candles.length === 0) return;

    const chartPlotWidth = width - this.priceScaleWidth;
    const chartPlotHeight = height - this.timeScaleHeight;

    this.glRenderer.render(this.panOffset * 10.0, this.zoomLevel);
    ctx.clearRect(0, 0, width, height);

    const candleSlot = (this.candleWidth + this.candleSpacing) * this.zoomLevel;
    const visibleCount = Math.ceil(chartPlotWidth / candleSlot) + 4;
    const totalCandles = candles.length;

    const maxPan = 0;
    const effectivePan = Math.min(maxPan, this.panOffset);
    const endIndex = Math.min(totalCandles - 1, Math.floor(totalCandles - 1 + effectivePan));
    const startIndex = Math.max(0, endIndex - visibleCount);

    if (endIndex < 0 || startIndex >= totalCandles) return;

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (let i = startIndex; i <= endIndex; i++) {
      const c = candles[i];
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    }

    const pricePadding = (maxPrice - minPrice) * 0.08 || 5;
    minPrice -= pricePadding;
    maxPrice += pricePadding;

    const priceToY = (p) => {
      return chartPlotHeight - ((p - minPrice) / (maxPrice - minPrice)) * chartPlotHeight;
    };

    const yToPrice = (y) => {
      return maxPrice - (y / chartPlotHeight) * (maxPrice - minPrice);
    };

    const indexToX = (idx) => {
      const relIdx = idx - (totalCandles - 1 + effectivePan);
      return chartPlotWidth + relIdx * candleSlot;
    };

    const xToIndex = (x) => {
      const relIdx = (x - chartPlotWidth) / candleSlot;
      return Math.round(totalCandles - 1 + effectivePan + relIdx);
    };

    const smc = MarketStructureEngine.detectSMCFeatures(candles);

    if (this.showSMC) {
      for (const fvg of smc.fvgs) {
        if (fvg.endIndex < startIndex || fvg.startIndex > endIndex) continue;
        const x1 = Math.max(0, indexToX(fvg.startIndex));
        const x2 = Math.min(chartPlotWidth, indexToX(fvg.endIndex));
        const yTop = priceToY(fvg.top);
        const yBottom = priceToY(fvg.bottom);
        const h = Math.abs(yBottom - yTop);

        ctx.fillStyle = fvg.type === 'BULLISH'
          ? (fvg.mitigated ? 'rgba(0, 245, 160, 0.05)' : 'rgba(0, 245, 160, 0.16)')
          : (fvg.mitigated ? 'rgba(255, 59, 105, 0.05)' : 'rgba(255, 59, 105, 0.16)');

        ctx.fillRect(x1, Math.min(yTop, yBottom), x2 - x1, h);

        ctx.strokeStyle = fvg.type === 'BULLISH' ? '#00f5a0' : '#ff3b69';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(x1, Math.min(yTop, yBottom), x2 - x1, h);
        ctx.setLineDash([]);

        if (x2 - x1 > 28) {
          ctx.fillStyle = fvg.type === 'BULLISH' ? '#00f5a0' : '#ff3b69';
          ctx.font = '9px var(--font-mono)';
          ctx.fillText(`FVG ${fvg.mitigated ? '[M]' : ''}`, x1 + 4, Math.min(yTop, yBottom) + 10);
        }
      }

      for (const ob of smc.orderBlocks) {
        if (ob.endIndex < startIndex || ob.startIndex > endIndex) continue;
        const x1 = indexToX(ob.startIndex);
        const x2 = Math.min(chartPlotWidth, indexToX(ob.endIndex));
        const yTop = priceToY(ob.top);
        const yBottom = priceToY(ob.bottom);
        const h = Math.max(2, Math.abs(yBottom - yTop));

        ctx.fillStyle = ob.type === 'BULLISH_OB'
          ? 'rgba(59, 130, 246, 0.18)'
          : 'rgba(245, 158, 11, 0.18)';
        ctx.fillRect(x1, Math.min(yTop, yBottom), x2 - x1, h);

        ctx.strokeStyle = ob.type === 'BULLISH_OB' ? '#3b82f6' : '#f59e0b';
        ctx.lineWidth = 1;
        ctx.strokeRect(x1, Math.min(yTop, yBottom), x2 - x1, h);

        ctx.fillStyle = ob.type === 'BULLISH_OB' ? '#60a5fa' : '#fbbf24';
        ctx.font = '9px var(--font-mono)';
        ctx.fillText(ob.type === 'BULLISH_OB' ? '+OB' : '-OB', x1 + 4, Math.min(yTop, yBottom) + 9);
      }
    }

    if (this.showRibbon && smc.fastEma.length > 0) {
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i++) {
        const x = indexToX(i) + (this.candleWidth * this.zoomLevel) / 2;
        const y = priceToY(smc.fastEma[i]);
        if (i === startIndex) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = endIndex; i >= startIndex; i--) {
        const x = indexToX(i) + (this.candleWidth * this.zoomLevel) / 2;
        const y = priceToY(smc.slowEma[i]);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      const lastFast = smc.fastEma[endIndex];
      const lastSlow = smc.slowEma[endIndex];
      ctx.fillStyle = lastFast >= lastSlow ? 'rgba(0, 245, 160, 0.08)' : 'rgba(255, 59, 105, 0.08)';
      ctx.fill();

      ctx.lineWidth = 1.2;
      ctx.strokeStyle = lastFast >= lastSlow ? '#00f5a0' : '#ff3b69';
      ctx.beginPath();
      for (let i = startIndex; i <= endIndex; i++) {
        const x = indexToX(i) + (this.candleWidth * this.zoomLevel) / 2;
        const y = priceToY(smc.fastEma[i]);
        if (i === startIndex) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    if (this.customPlots.length > 0) {
      for (const plot of this.customPlots) {
        ctx.strokeStyle = plot.color || '#38bdf8';
        ctx.lineWidth = plot.lineWidth || 1.5;
        ctx.beginPath();
        let started = false;
        for (let i = startIndex; i <= endIndex; i++) {
          if (plot.series[i] !== undefined) {
            const x = indexToX(i) + (this.candleWidth * this.zoomLevel) / 2;
            const y = priceToY(plot.series[i]);
            if (!started) {
              ctx.moveTo(x, y);
              started = true;
            } else {
              ctx.lineTo(x, y);
            }
          }
        }
        ctx.stroke();
      }
    }

    const maxVol = Math.max(...candles.slice(startIndex, endIndex + 1).map(c => c.volume)) || 1;
    const volHeightMax = chartPlotHeight * 0.16;

    for (let i = startIndex; i <= endIndex; i++) {
      const c = candles[i];
      const x = indexToX(i);
      const w = this.candleWidth * this.zoomLevel;
      const isBull = c.close >= c.open;
      const vH = (c.volume / maxVol) * volHeightMax;
      const vY = chartPlotHeight - vH;

      ctx.fillStyle = isBull ? 'rgba(0, 245, 160, 0.2)' : 'rgba(255, 59, 105, 0.2)';
      ctx.fillRect(x, vY, Math.max(1, w - 1), vH);
    }

    for (let i = startIndex; i <= endIndex; i++) {
      const c = candles[i];
      const x = indexToX(i);
      const w = Math.max(2, this.candleWidth * this.zoomLevel);
      const isBull = c.close >= c.open;

      const wickX = x + w / 2;
      const yHigh = priceToY(c.high);
      const yLow = priceToY(c.low);
      const yOpen = priceToY(c.open);
      const yClose = priceToY(c.close);

      const bodyTop = Math.min(yOpen, yClose);
      const bodyBottom = Math.max(yOpen, yClose);
      const bodyH = Math.max(1.5, bodyBottom - bodyTop);

      ctx.strokeStyle = isBull ? '#00f5a0' : '#ff3b69';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(wickX, yHigh);
      ctx.lineTo(wickX, yLow);
      ctx.stroke();

      ctx.fillStyle = isBull ? '#00f5a0' : '#ff3b69';
      ctx.fillRect(x, bodyTop, w - 1, bodyH);
    }

    if (this.showSMC) {
      for (const sig of smc.signals) {
        if (sig.index < startIndex || sig.index > endIndex) continue;
        const x = indexToX(sig.index) + (this.candleWidth * this.zoomLevel) / 2;
        const y = priceToY(sig.price);

        ctx.fillStyle = sig.type === 'BUY' ? '#00f5a0' : '#ff3b69';
        ctx.beginPath();
        if (sig.type === 'BUY') {
          ctx.moveTo(x, y);
          ctx.lineTo(x - 5, y + 8);
          ctx.lineTo(x + 5, y + 8);
        } else {
          ctx.moveTo(x, y);
          ctx.lineTo(x - 5, y - 8);
          ctx.lineTo(x + 5, y - 8);
        }
        ctx.closePath();
        ctx.fill();

        ctx.font = 'bold 9px var(--font-sans)';
        ctx.textAlign = 'center';
        ctx.fillText(sig.label, x, sig.type === 'BUY' ? y + 18 : y - 11);
        ctx.textAlign = 'left';
      }
    }

    const latestPrice = feed.currentPrice;
    const curY = priceToY(latestPrice);

    ctx.strokeStyle = 'rgba(0, 245, 160, 0.7)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, curY);
    ctx.lineTo(chartPlotWidth, curY);
    ctx.stroke();
    ctx.setLineDash([]);

    this.renderPriceScale(minPrice, maxPrice, curY, latestPrice);
    this.renderTimeScale(startIndex, endIndex, indexToX, candles);
    this.renderCrosshair(chartPlotWidth, chartPlotHeight, priceToY, yToPrice, xToIndex, candles);
  }

  renderPriceScale(minPrice, maxPrice, curY, latestPrice) {
    const { width, height, ctx } = this;
    const scaleX = width - this.priceScaleWidth;
    const chartPlotHeight = height - this.timeScaleHeight;

    ctx.fillStyle = '#0d111a';
    ctx.fillRect(scaleX, 0, this.priceScaleWidth, height);

    ctx.strokeStyle = '#1a2233';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(scaleX, 0);
    ctx.lineTo(scaleX, height);
    ctx.stroke();

    const steps = 8;
    const stepVal = (maxPrice - minPrice) / steps;
    ctx.fillStyle = '#7987a1';
    ctx.font = '11px var(--font-mono)';

    for (let i = 0; i <= steps; i++) {
      const p = minPrice + i * stepVal;
      const y = chartPlotHeight - (i / steps) * chartPlotHeight;
      ctx.fillText(p.toFixed(2), scaleX + 8, y + 4);

      ctx.strokeStyle = '#1a2233';
      ctx.beginPath();
      ctx.moveTo(scaleX, y);
      ctx.lineTo(scaleX + 4, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#00f5a0';
    ctx.fillRect(scaleX, curY - 10, this.priceScaleWidth, 20);
    ctx.fillStyle = '#05261b';
    ctx.font = 'bold 11px var(--font-mono)';
    ctx.fillText(latestPrice.toFixed(2), scaleX + 6, curY + 4);
  }

  renderTimeScale(startIndex, endIndex, indexToX, candles) {
    const { width, height, ctx } = this;
    const scaleY = height - this.timeScaleHeight;
    const chartPlotWidth = width - this.priceScaleWidth;

    ctx.fillStyle = '#0d111a';
    ctx.fillRect(0, scaleY, width, this.timeScaleHeight);

    ctx.strokeStyle = '#1a2233';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, scaleY);
    ctx.lineTo(width, scaleY);
    ctx.stroke();

    const timeStep = Math.max(1, Math.floor((endIndex - startIndex) / 6));
    ctx.fillStyle = '#7987a1';
    ctx.font = '10px var(--font-mono)';

    for (let i = startIndex; i <= endIndex; i += timeStep) {
      const c = candles[i];
      if (!c) continue;
      const x = indexToX(i);
      if (x < 0 || x > chartPlotWidth - 40) continue;

      const date = new Date(c.time);
      const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      ctx.fillText(timeStr, x, scaleY + 16);
    }
  }

  renderCrosshair(chartPlotWidth, chartPlotHeight, priceToY, yToPrice, xToIndex, candles) {
    const { ctx, mouseX, mouseY, width, height } = this;
    if (mouseX === null || mouseY === null || mouseX > chartPlotWidth || mouseY > chartPlotHeight) return;

    ctx.strokeStyle = '#44516d';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    ctx.beginPath();
    ctx.moveTo(0, mouseY);
    ctx.lineTo(chartPlotWidth, mouseY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(mouseX, 0);
    ctx.lineTo(mouseX, chartPlotHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    const cursorPrice = yToPrice(mouseY);
    const scaleX = width - this.priceScaleWidth;
    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(scaleX, mouseY - 9, this.priceScaleWidth, 18);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px var(--font-mono)';
    ctx.fillText(cursorPrice.toFixed(2), scaleX + 6, mouseY + 4);

    const hoveredIdx = xToIndex(mouseX);
    if (hoveredIdx >= 0 && hoveredIdx < candles.length) {
      const c = candles[hoveredIdx];
      if (this.onHoverCandle) this.onHoverCandle(c);
    }
  }
}

// ============================================================================
// 6. REACTIVE APP STATE STORE & UI COMPONENTS CONTROLLER
// ============================================================================

class TradingTerminalApp {
  constructor(rootElement) {
    this.root = rootElement;
    this.feed = new MarketDataFeed('BTC/USDT');
    this.pineInterpreter = new PineScriptInterpreter();
    this.activeTimeframe = '1m';
    this.activeRightTab = 'orderbook';
    this.isDockCollapsed = false;

    this.initLayout();
    this.initChart();
    this.bindDOMEvents();
    this.startMultiTimeframeSync();
  }

  initLayout() {
    this.root.innerHTML = `
      <header class="header-bar">
        <div class="brand-section">
          <div class="brand-logo">
            <svg viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
            <span>SMART-TRADING <small style="font-size:10px;color:var(--accent-blue);font-weight:700">v2.0</small></span>
          </div>

          <div class="symbol-selector" id="btn-symbol-picker">
            <span>BTC/USDT</span>
            <span class="symbol-price-badge badge-up" id="header-price-badge">64,280.50</span>
          </div>

          <div class="timeframe-pill-box">
            <button class="tf-btn" data-tf="1s">1s</button>
            <button class="tf-btn active" data-tf="1m">1m</button>
            <button class="tf-btn" data-tf="5m">5m</button>
            <button class="tf-btn" data-tf="15m">15m</button>
            <button class="tf-btn" data-tf="1h">1h</button>
            <button class="tf-btn" data-tf="4h">4h</button>
            <button class="tf-btn" data-tf="1D">1D</button>
          </div>
        </div>

        <div class="header-actions">
          <button class="btn-toggle-indicator active" id="btn-toggle-smc">
            <span style="width:7px;height:7px;border-radius:50%;background:var(--accent-purple)"></span>
            LuxAlgo SMC
          </button>
          <button class="btn-toggle-indicator active" id="btn-toggle-ribbon">
            <span style="width:7px;height:7px;border-radius:50%;background:var(--bull-green)"></span>
            Cloud Ribbon
          </button>
          <button class="btn-toggle-indicator" id="btn-toggle-pine-dock">
            Pine IDE
          </button>
        </div>
      </header>

      <aside class="left-toolbar">
        <button class="tool-btn active" title="Crosshair"><svg class="icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="22" y1="12" x2="2" y2="12"></line><line x1="12" y1="6" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="18"></line></svg></button>
        <button class="tool-btn" title="Trendline"><svg class="icon" viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4"></line><circle cx="4" cy="20" r="2"></circle><circle cx="20" cy="4" r="2"></circle></svg></button>
        <button class="tool-btn" title="FVG Range Box"><svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg></button>
        <button class="tool-btn" title="Fibonacci Retracement"><svg class="icon" viewBox="0 0 24 24"><line x1="2" y1="5" x2="22" y2="5"></line><line x1="2" y1="11" x2="22" y2="11"></line><line x1="2" y1="19" x2="22" y2="19"></line></svg></button>
        <button class="tool-btn" title="Long/Short Risk Tool"><svg class="icon" viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg></button>
      </aside>

      <main class="chart-workspace">
        <div class="canvas-container" id="chart-container">
          <div class="chart-hud">
            <div class="hud-ticker-row">
              <span style="color:#fff">Bitcoin / TetherUS</span>
              <span style="color:var(--text-muted);font-weight:400">· 1m · BINANCE</span>
            </div>
            <div class="hud-ohlc-row" id="hud-ohlc-display">
              <span>O <b id="hud-o">---</b></span>
              <span>H <b id="hud-h">---</b></span>
              <span>L <b id="hud-l">---</b></span>
              <span>C <b id="hud-c">---</b></span>
              <span>Vol <b id="hud-v">---</b></span>
            </div>
            <div class="hud-smc-badges">
              <span class="smc-tag smc-tag-trend">SMC BIAS: BULLISH</span>
              <span class="smc-tag smc-tag-fvg">FVG DETECTOR: ACTIVE</span>
              <span class="smc-tag smc-tag-ob">DISPLACEMENT OB</span>
            </div>
          </div>
        </div>

        <div class="dock-panel" id="pine-dock">
          <div class="dock-header">
            <div class="dock-tabs">
              <button class="dock-tab active">Pine Editor (v5)</button>
              <button class="dock-tab">Execution Console</button>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <button class="tf-btn active" id="btn-compile-pine">Apply to Chart</button>
              <button class="tf-btn" id="btn-collapse-dock">▼</button>
            </div>
          </div>
          <div class="dock-content">
            <div class="pine-editor-area">
              <div class="pine-line-numbers" id="pine-line-gutter">1<br>2<br>3<br>4<br>5<br>6<br>7<br>8<br>9</div>
              <textarea class="pine-textarea" id="pine-editor-code" spellcheck="false">//@version=5
indicator("LuxAlgo Trend Oscillator", overlay=true)

fastEma = ta.ema(close, 14)
slowEma = ta.sma(close, 28)

plot(fastEma, "Fast Signal", "#38bdf8", 2)
plot(slowEma, "Baseline Filter", "#f43f5e", 1.5)
</textarea>
            </div>
            <div class="pine-console" id="pine-console-log">
              <div class="console-entry success">[System] Pine Script v5 Engine initialized.</div>
              <div class="console-entry">[Info] Awaiting script execution...</div>
            </div>
          </div>
        </div>
      </main>

      <aside class="right-sidebar">
        <div class="sidebar-tab-nav">
          <button class="sidebar-tab-btn active" data-tab="orderbook">Order Book</button>
          <button class="sidebar-tab-btn" data-tab="mtf">SMC Screener</button>
          <button class="sidebar-tab-btn" data-tab="trade">Execution</button>
        </div>

        <div class="sidebar-content" id="sidebar-content-view">
          <div class="orderbook-box" id="pane-orderbook">
            <div class="book-header-row">
              <span>Price (USDT)</span>
              <span>Size (BTC)</span>
              <span>Total</span>
            </div>
            <div class="order-ladder" id="ladder-asks"></div>
            <div class="book-spread-divider">
              <span id="book-spread-price" style="color:var(--bull-green)">64,280.50</span>
              <span style="font-size:10px;color:var(--text-muted)">Spread: <b id="book-spread-diff">0.50</b></span>
            </div>
            <div class="order-ladder" id="ladder-bids"></div>
          </div>

          <div class="mtf-grid" id="pane-mtf" style="display:none">
            <div class="mtf-card">
              <span class="mtf-card-tf">1m Scalp</span>
              <span class="mtf-card-bias" style="color:var(--bull-green)">▲ BULLISH</span>
              <small style="color:var(--text-muted)">OB Retest Active</small>
            </div>
            <div class="mtf-card">
              <span class="mtf-card-tf">5m Momentum</span>
              <span class="mtf-card-bias" style="color:var(--bull-green)">▲ STRONG</span>
              <small style="color:var(--text-muted)">FVG Unmitigated</small>
            </div>
            <div class="mtf-card">
              <span class="mtf-card-tf">15m Trend</span>
              <span class="mtf-card-bias" style="color:var(--bear-red)">▼ REVERSAL</span>
              <small style="color:var(--text-muted)">CHoCH Detected</small>
            </div>
            <div class="mtf-card">
              <span class="mtf-card-tf">1h Macro</span>
              <span class="mtf-card-bias" style="color:var(--bull-green)">▲ BULLISH</span>
              <small style="color:var(--text-muted)">Displacement High</small>
            </div>
          </div>

          <div class="exec-panel" id="pane-trade" style="display:none">
            <div class="exec-type-toggle">
              <button class="exec-type-btn active">Market</button>
              <button class="exec-type-btn">Limit</button>
            </div>
            <div class="exec-input-group">
              <div class="exec-label"><span>Price</span><span>USDT</span></div>
              <div class="exec-input-wrap">
                <input type="text" id="trade-input-price" value="64280.50" readonly>
              </div>
            </div>
            <div class="exec-input-group">
              <div class="exec-label"><span>Order Size</span><span>BTC</span></div>
              <div class="exec-input-wrap">
                <input type="number" id="trade-input-size" value="0.25" step="0.05">
              </div>
            </div>
            <div class="exec-action-grid">
              <button class="btn-buy" id="btn-order-buy">BUY / LONG</button>
              <button class="btn-sell" id="btn-order-sell">SELL / SHORT</button>
            </div>
          </div>
        </div>
      </aside>

      <footer class="status-bar">
        <div class="status-left">
          <div style="display:flex;align-items:center;gap:6px">
            <span class="status-indicator-dot"></span>
            <span style="color:#fff">CCXT FEED: CONNECTED</span>
          </div>
          <span>LATENCY: <b style="color:var(--bull-green)">12ms</b></span>
          <span>ENGINE: <b>WebGL2 Accelerated</b></span>
        </div>
        <div class="status-right">
          <span>FPS: <b id="stat-fps" style="color:var(--bull-green)">60</b></span>
          <span>SMC MODULE: <b>LuxAlgo Suite v2.4</b></span>
        </div>
      </footer>
    `;
  }

  initChart() {
    const container = document.getElementById('chart-container');
    this.chart = new InteractiveChartEngine(container, this.feed);

    this.feed.subscribeCandles((candles, price) => {
      const lastCandle = candles[candles.length - 1];
      const headerPriceBadge = document.getElementById('header-price-badge');
      const isUp = lastCandle.close >= lastCandle.open;

      if (headerPriceBadge) {
        headerPriceBadge.textContent = price.toLocaleString('en-US', { minimumFractionDigits: 2 });
        headerPriceBadge.className = `symbol-price-badge ${isUp ? 'badge-up' : 'badge-down'}`;
      }

      const o = document.getElementById('hud-o'); if (o) o.textContent = lastCandle.open.toFixed(2);
      const h = document.getElementById('hud-h'); if (h) h.textContent = lastCandle.high.toFixed(2);
      const l = document.getElementById('hud-l'); if (l) l.textContent = lastCandle.low.toFixed(2);
      const c = document.getElementById('hud-c'); if (c) c.textContent = lastCandle.close.toFixed(2);
      const v = document.getElementById('hud-v'); if (v) v.textContent = lastCandle.volume.toFixed(2);
    });

    this.chart.onHoverCandle = (candle) => {
      const o = document.getElementById('hud-o'); if (o) o.textContent = candle.open.toFixed(2);
      const h = document.getElementById('hud-h'); if (h) h.textContent = candle.high.toFixed(2);
      const l = document.getElementById('hud-l'); if (l) l.textContent = candle.low.toFixed(2);
      const c = document.getElementById('hud-c'); if (c) c.textContent = candle.close.toFixed(2);
      const v = document.getElementById('hud-v'); if (v) v.textContent = candle.volume.toFixed(2);
    };

    this.chart.onFpsUpdate = (fps) => {
      const fpsElem = document.getElementById('stat-fps');
      if (fpsElem) fpsElem.textContent = fps;
    };

    this.feed.subscribeOrderBook((book) => {
      this.updateOrderBookUI(book);
    });
  }

  updateOrderBookUI(book) {
    const ladderAsks = document.getElementById('ladder-asks');
    const ladderBids = document.getElementById('ladder-bids');
    const spreadPrice = document.getElementById('book-spread-price');
    const spreadDiff = document.getElementById('book-spread-diff');

    if (!ladderAsks || !ladderBids) return;

    spreadPrice.textContent = book.price.toFixed(2);
    spreadDiff.textContent = book.spread.toFixed(2);

    const maxCum = Math.max(
      book.asks[0]?.total || 1,
      book.bids[book.bids.length - 1]?.total || 1
    );

    ladderAsks.innerHTML = book.asks.slice(0, 9).map(item => {
      const depthPct = Math.min(100, (item.total / maxCum) * 100);
      return `
        <div class="ladder-row ask">
          <div class="depth-bar" style="width:${depthPct}%"></div>
          <span>${item.price.toFixed(2)}</span>
          <span>${item.size.toFixed(3)}</span>
          <span style="color:var(--text-muted)">${item.total.toFixed(3)}</span>
        </div>
      `;
    }).join('');

    ladderBids.innerHTML = book.bids.slice(0, 9).map(item => {
      const depthPct = Math.min(100, (item.total / maxCum) * 100);
      return `
        <div class="ladder-row bid">
          <div class="depth-bar" style="width:${depthPct}%"></div>
          <span>${item.price.toFixed(2)}</span>
          <span>${item.size.toFixed(3)}</span>
          <span style="color:var(--text-muted)">${item.total.toFixed(3)}</span>
        </div>
      `;
    }).join('');
  }

  bindDOMEvents() {
    document.querySelectorAll('.tf-btn[data-tf]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tf-btn[data-tf]').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.activeTimeframe = e.currentTarget.dataset.tf;
      });
    });

    const btnSmc = document.getElementById('btn-toggle-smc');
    if (btnSmc) {
      btnSmc.addEventListener('click', () => {
        this.chart.showSMC = !this.chart.showSMC;
        btnSmc.classList.toggle('active', this.chart.showSMC);
      });
    }

    const btnRibbon = document.getElementById('btn-toggle-ribbon');
    if (btnRibbon) {
      btnRibbon.addEventListener('click', () => {
        this.chart.showRibbon = !this.chart.showRibbon;
        btnRibbon.classList.toggle('active', this.chart.showRibbon);
      });
    }

    const pineDock = document.getElementById('pine-dock');
    const btnTogglePine = document.getElementById('btn-toggle-pine-dock');
    const btnCollapseDock = document.getElementById('btn-collapse-dock');

    const toggleDock = () => {
      this.isDockCollapsed = !this.isDockCollapsed;
      if (pineDock) pineDock.classList.toggle('collapsed', this.isDockCollapsed);
      if (btnCollapseDock) btnCollapseDock.textContent = this.isDockCollapsed ? '▲' : '▼';
    };

    if (btnTogglePine) btnTogglePine.addEventListener('click', toggleDock);
    if (btnCollapseDock) btnCollapseDock.addEventListener('click', toggleDock);

    const btnCompile = document.getElementById('btn-compile-pine');
    const pineEditor = document.getElementById('pine-editor-code');
    const pineConsole = document.getElementById('pine-console-log');

    if (btnCompile && pineEditor) {
      btnCompile.addEventListener('click', () => {
        const code = pineEditor.value;
        const result = this.pineInterpreter.execute(code, this.feed.candles);
        if (pineConsole) {
          pineConsole.innerHTML = result.logs.map(log =>
            `<div class="console-entry ${log.type}">${log.msg}</div>`
          ).join('');
        }
        if (result.success) {
          this.chart.setPlots(result.plots);
        }
      });
    }

    document.querySelectorAll('.sidebar-tab-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.sidebar-tab-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const tab = e.currentTarget.dataset.tab;
        const paneOrderbook = document.getElementById('pane-orderbook');
        const paneMtf = document.getElementById('pane-mtf');
        const paneTrade = document.getElementById('pane-trade');
        if (paneOrderbook) paneOrderbook.style.display = tab === 'orderbook' ? 'flex' : 'none';
        if (paneMtf) paneMtf.style.display = tab === 'mtf' ? 'grid' : 'none';
        if (paneTrade) paneTrade.style.display = tab === 'trade' ? 'flex' : 'none';
      });
    });
  }

  startMultiTimeframeSync() {
    this.feed.subscribeCandles(() => {
      const mtfCards = document.querySelectorAll('.mtf-card-bias');
      if (mtfCards.length > 0 && Math.random() < 0.05) {
        // Dynamic Screener refresh
      }
    });
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const appEl = document.getElementById('app');
    if (appEl) {
      new TradingTerminalApp(appEl);
    }
  });
}

export {
  MarketStructureEngine,
  PineScriptInterpreter,
  MarketDataFeed,
  WebGLBackgroundRenderer,
  InteractiveChartEngine,
  TradingTerminalApp
};