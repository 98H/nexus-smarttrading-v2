import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { mountApp } from '../src/main.js';
import { Chart } from '../src/chart.js';

// Minimal canvas rendering context mock to track frame renders and pixel mutations
function createMockCanvasContext() {
  return {
    drawCalls: 0,
    clearRect: function () { this.drawCalls++; },
    fillRect: function () { this.drawCalls++; },
    stroke: function () { this.drawCalls++; },
    fillText: function () { this.drawCalls++; },
    beginPath: function () {},
    moveTo: function () {},
    lineTo: function () {},
  };
}

// Minimal DOM Element mock to capture DOM text mutations and attributes
function createMockElement(id = '') {
  let _textContent = '';
  return {
    id,
    mutationCount: 0,
    get textContent() {
      return _textContent;
    },
    set textContent(val) {
      if (_textContent !== val) {
        this.mutationCount++;
      }
      _textContent = String(val);
    },
    children: [],
    querySelector: function (selector) {
      if (selector === `#${this.id}`) return this;
      return this.children.find((child) => selector === `#${child.id}`) || null;
    },
    appendChild: function (child) {
      this.children.push(child);
      return child;
    },
  };
}

describe('STORY 1.1.1: Resolve STATIC_APPLICATION (DF-LIVENESS-01)', () => {
  const OBSERVATION_WINDOW_MS = 2500;

  describe('Chart Module - Animation & Render Liveness (src/chart.js)', () => {
    it('must render multiple animation frames and mutate canvas within the 2.5-second window', (t) => {
      t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });

      const mockCtx = createMockCanvasContext();
      const mockCanvas = {
        getContext: (type) => (type === '2d' ? mockCtx : null),
        width: 800,
        height: 600,
      };

      const chart = new Chart(mockCanvas);
      chart.start();

      assert.strictEqual(
        mockCtx.drawCalls,
        0,
        'Canvas should have 0 draw calls immediately prior to timer advancement'
      );
      assert.strictEqual(
        chart.getFrameCount(),
        0,
        'Chart frame count should initially be 0'
      );

      // Fast-forward through the 2.5-second observation window
      t.mock.timers.tick(OBSERVATION_WINDOW_MS);

      // Verify animation frames have been produced
      assert.ok(
        chart.getFrameCount() > 0,
        `Expected frame count > 0 after ${OBSERVATION_WINDOW_MS}ms, but got ${chart.getFrameCount()}`
      );

      // Verify canvas operations took place (not a static painting)
      assert.ok(
        mockCtx.drawCalls > 0,
        `Expected canvas draw calls > 0 after ${OBSERVATION_WINDOW_MS}ms, but got ${mockCtx.drawCalls}`
      );

      chart.stop();
    });
  });

  describe('Main Application - Real-Time Data & Ticker Liveness (src/main.js)', () => {
    it('must mutate price ticker or order book DOM state over a 2.5-second observation window', async (t) => {
      t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });

      const container = createMockElement('app-root');
      const tickerElement = createMockElement('price-ticker');
      const orderBookElement = createMockElement('order-book');
      const clockElement = createMockElement('clock-tick');

      container.appendChild(tickerElement);
      container.appendChild(orderBookElement);
      container.appendChild(clockElement);

      const app = mountApp(container);

      // Initial state baseline capture
      const initialTickerText = tickerElement.textContent;
      const initialOrderBookText = orderBookElement.textContent;
      const initialClockText = clockElement.textContent;

      const initialTickerMutations = tickerElement.mutationCount;
      const initialOrderBookMutations = orderBookElement.mutationCount;
      const initialClockMutations = clockElement.mutationCount;

      // Elapse the required 2.5-second observation window
      t.mock.timers.tick(OBSERVATION_WINDOW_MS);

      const tickerChanged = tickerElement.textContent !== initialTickerText ||
        tickerElement.mutationCount > initialTickerMutations;

      const orderBookChanged = orderBookElement.textContent !== initialOrderBookText ||
        orderBookElement.mutationCount > initialOrderBookMutations;

      const clockChanged = clockElement.textContent !== initialClockText ||
        clockElement.mutationCount > initialClockMutations;

      // Defect DF-LIVENESS-01: At least one live data mechanism must be active
      const hasLivenessUpdate = tickerChanged || orderBookChanged || clockChanged;

      assert.ok(
        hasLivenessUpdate,
        `Defect DF-LIVENESS-01 detected: Application is static. ` +
        `Neither price ticker, order book, nor clock mutated over ${OBSERVATION_WINDOW_MS}ms.`
      );

      app.destroy();
    });

    it('must record periodic state mutations and timestamps across the 2.5-second window', (t) => {
      t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });

      const container = createMockElement('app-root');
      const app = mountApp(container);

      const initialTimestamp = app.getLastMutationTimestamp();

      // Tick forward by half the window (1250ms)
      t.mock.timers.tick(1250);
      const midTimestamp = app.getLastMutationTimestamp();

      // Tick forward remainder of the window (1250ms -> 2500ms)
      t.mock.timers.tick(1250);
      const finalTimestamp = app.getLastMutationTimestamp();

      assert.ok(
        midTimestamp > initialTimestamp,
        'Expected at least one mutation timestamp update during first 1.25s'
      );
      assert.ok(
        finalTimestamp > midTimestamp,
        'Expected continuous mutation timestamp updates through 2.5s'
      );
      assert.ok(
        app.getMutationCount() >= 2,
        `Expected at least 2 state mutations over 2.5s, got ${app.getMutationCount()}`
      );

      app.destroy();
    });
  });
});