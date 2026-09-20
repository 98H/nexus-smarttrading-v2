import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import {
  SplitScreenContainer,
  calculateViewportDimensions,
  getGridTemplate,
  LAYOUT_CONFIGS
} from '../src/components/layout/SplitScreenContainer.js';
import type {
  LayoutType,
  ContainerDimensions,
  ViewportSlot,
  GridGapConfig
} from '../src/types/layout.js';

describe('Story 5.1.1: Dynamic Split-Screen Layout Container', () => {
  describe('Acceptance Criteria 1: Layout Selection and Viewport Container Rendering', () => {
    it('should render exactly 1 independent WebGL viewport container for "1x1" layout', () => {
      const layout: LayoutType = '1x1';
      const expectedSlotCount = 1;

      const html = renderToStaticMarkup(
        React.createElement(SplitScreenContainer, {
          layout,
          dimensions: { width: 1920, height: 1080 },
          children: (slot: ViewportSlot) =>
            React.createElement('canvas', {
              id: `webgl-canvas-${slot.id}`,
              'data-slot-index': slot.index,
              className: 'webgl-chart-viewport'
            })
        })
      );

      // Verify layout class
      assert.ok(
        html.includes('split-screen-container'),
        'Root container must include "split-screen-container" CSS class'
      );
      assert.ok(
        html.includes('layout-1x1'),
        'Root container must include "layout-1x1" CSS class'
      );

      // Verify slot containers rendered
      const slotMatches = html.match(/data-slot-id="slot-[0-9]+"/g) || [];
      assert.strictEqual(
        slotMatches.length,
        expectedSlotCount,
        `Expected ${expectedSlotCount} slot container(s), found ${slotMatches.length}`
      );

      // Verify specific slot and canvas existence
      assert.ok(html.includes('data-slot-id="slot-0"'), 'Slot 0 must be present');
      assert.ok(html.includes('id="webgl-canvas-slot-0"'), 'WebGL canvas for slot 0 must be present');
    });

    it('should render exactly 2 independent WebGL viewport containers for "2x1" layout', () => {
      const layout: LayoutType = '2x1';
      const expectedSlotCount = 2;

      const html = renderToStaticMarkup(
        React.createElement(SplitScreenContainer, {
          layout,
          dimensions: { width: 1920, height: 1080 },
          children: (slot: ViewportSlot) =>
            React.createElement('canvas', {
              id: `webgl-canvas-${slot.id}`,
              'data-slot-index': slot.index,
              className: 'webgl-chart-viewport'
            })
        })
      );

      assert.ok(html.includes('layout-2x1'), 'Root container must include "layout-2x1" CSS class');

      const slotMatches = html.match(/data-slot-id="slot-[0-9]+"/g) || [];
      assert.strictEqual(slotMatches.length, expectedSlotCount);

      // Validate each independent viewport slot has unique IDs
      assert.ok(html.includes('data-slot-id="slot-0"'));
      assert.ok(html.includes('data-slot-id="slot-1"'));
      assert.ok(html.includes('id="webgl-canvas-slot-0"'));
      assert.ok(html.includes('id="webgl-canvas-slot-1"'));
    });

    it('should render exactly 4 independent WebGL viewport containers for "2x2" layout', () => {
      const layout: LayoutType = '2x2';
      const expectedSlotCount = 4;

      const html = renderToStaticMarkup(
        React.createElement(SplitScreenContainer, {
          layout,
          dimensions: { width: 1920, height: 1080 },
          children: (slot: ViewportSlot) =>
            React.createElement('div', {
              id: `webgl-viewport-${slot.id}`,
              'data-slot-index': slot.index
            })
        })
      );

      assert.ok(html.includes('layout-2x2'), 'Root container must include "layout-2x2" CSS class');

      const slotMatches = html.match(/data-slot-id="slot-[0-9]+"/g) || [];
      assert.strictEqual(slotMatches.length, expectedSlotCount);

      for (let i = 0; i < expectedSlotCount; i++) {
        assert.ok(
          html.includes(`data-slot-id="slot-${i}"`),
          `Expected slot-${i} to be present in 2x2 layout`
        );
        assert.ok(
          html.includes(`id="webgl-viewport-slot-${i}"`),
          `Expected viewport content for slot-${i}`
        );
      }
    });

    it('should render exactly 3 independent WebGL viewport containers for "1x3" layout', () => {
      const layout: LayoutType = '1x3';
      const expectedSlotCount = 3;

      const html = renderToStaticMarkup(
        React.createElement(SplitScreenContainer, {
          layout,
          dimensions: { width: 1920, height: 1080 },
          children: (slot: ViewportSlot) =>
            React.createElement('canvas', {
              id: `webgl-canvas-${slot.id}`,
              'data-slot-index': slot.index
            })
        })
      );

      assert.ok(html.includes('layout-1x3'), 'Root container must include "layout-1x3" CSS class');

      const slotMatches = html.match(/data-slot-id="slot-[0-9]+"/g) || [];
      assert.strictEqual(slotMatches.length, expectedSlotCount);

      for (let i = 0; i < expectedSlotCount; i++) {
        assert.ok(
          html.includes(`data-slot-id="slot-${i}"`),
          `Expected slot-${i} to be present in 1x3 layout`
        );
      }
    });

    it('should reject invalid layout types by throwing a descriptive TypeError', () => {
      const invalidLayout = '3x3' as unknown as LayoutType;

      assert.throws(
        () => {
          renderToStaticMarkup(
            React.createElement(SplitScreenContainer, {
              layout: invalidLayout,
              dimensions: { width: 1920, height: 1080 },
              children: () => null
            })
          );
        },
        {
          name: 'TypeError',
          message: /Unsupported layout configuration: 3x3/
        }
      );
    });

    it('should provide complete layout configuration specifications via LAYOUT_CONFIGS constant', () => {
      assert.deepStrictEqual(LAYOUT_CONFIGS['1x1'], { columns: 1, rows: 1, totalSlots: 1 });
      assert.deepStrictEqual(LAYOUT_CONFIGS['2x1'], { columns: 2, rows: 1, totalSlots: 2 });
      assert.deepStrictEqual(LAYOUT_CONFIGS['2x2'], { columns: 2, rows: 2, totalSlots: 4 });
      assert.deepStrictEqual(LAYOUT_CONFIGS['1x3'], { columns: 3, rows: 1, totalSlots: 3 });
    });
  });

  describe('Acceptance Criteria 2: Responsive Grid Recalculation on Container Resize', () => {
    const gapConfig: GridGapConfig = { columnGap: 8, rowGap: 8 };

    it('should recalculate 1x1 dimensions to occupy full container without gap deduction', () => {
      const initialDimensions: ContainerDimensions = { width: 1920, height: 1080 };
      const resizedDimensions: ContainerDimensions = { width: 1280, height: 720 };

      const initialSlots = calculateViewportDimensions('1x1', initialDimensions, gapConfig);
      assert.strictEqual(initialSlots.length, 1);
      assert.deepStrictEqual(initialSlots[0], {
        id: 'slot-0',
        index: 0,
        x: 0,
        y: 0,
        width: 1920,
        height: 1080
      });

      const resizedSlots = calculateViewportDimensions('1x1', resizedDimensions, gapConfig);
      assert.strictEqual(resizedSlots.length, 1);
      assert.deepStrictEqual(resizedSlots[0], {
        id: 'slot-0',
        index: 0,
        x: 0,
        y: 0,
        width: 1280,
        height: 720
      });
    });

    it('should recalculate 2x1 grid slot dimensions and offsets dynamically on resize', () => {
      // 2 columns, 1 row. Column gap = 8px. Total width = 1920.
      // Expected slot width = (1920 - 8) / 2 = 956px. Height = 1080px.
      const dimensions1: ContainerDimensions = { width: 1920, height: 1080 };
      const slots1 = calculateViewportDimensions('2x1', dimensions1, gapConfig);

      assert.strictEqual(slots1.length, 2);
      assert.deepStrictEqual(slots1[0], {
        id: 'slot-0',
        index: 0,
        x: 0,
        y: 0,
        width: 956,
        height: 1080
      });
      assert.deepStrictEqual(slots1[1], {
        id: 'slot-1',
        index: 1,
        x: 964, // 956 + 8
        y: 0,
        width: 956,
        height: 1080
      });

      // Resize container to 1000 x 500
      // Slot width = (1000 - 8) / 2 = 496px. Height = 500px.
      const dimensions2: ContainerDimensions = { width: 1000, height: 500 };
      const slots2 = calculateViewportDimensions('2x1', dimensions2, gapConfig);

      assert.strictEqual(slots2.length, 2);
      assert.deepStrictEqual(slots2[0], {
        id: 'slot-0',
        index: 0,
        x: 0,
        y: 0,
        width: 496,
        height: 500
      });
      assert.deepStrictEqual(slots2[1], {
        id: 'slot-1',
        index: 1,
        x: 504, // 496 + 8
        y: 0,
        width: 496,
        height: 500
      });
    });

    it('should recalculate 2x2 grid slot dimensions and offsets across both axes on resize', () => {
      // 2 columns, 2 rows. Gap = 10px each axis.
      const customGap: GridGapConfig = { columnGap: 10, rowGap: 10 };
      const container: ContainerDimensions = { width: 1010, height: 610 };

      // Slot width = (1010 - 10) / 2 = 500
      // Slot height = (610 - 10) / 2 = 300
      const slots = calculateViewportDimensions('2x2', container, customGap);

      assert.strictEqual(slots.length, 4);

      // Top-Left
      assert.deepStrictEqual(slots[0], {
        id: 'slot-0',
        index: 0,
        x: 0,
        y: 0,
        width: 500,
        height: 300
      });
      // Top-Right
      assert.deepStrictEqual(slots[1], {
        id: 'slot-1',
        index: 1,
        x: 510,
        y: 0,
        width: 500,
        height: 300
      });
      // Bottom-Left
      assert.deepStrictEqual(slots[2], {
        id: 'slot-2',
        index: 2,
        x: 0,
        y: 310,
        width: 500,
        height: 300
      });
      // Bottom-Right
      assert.deepStrictEqual(slots[3], {
        id: 'slot-3',
        index: 3,
        x: 510,
        y: 310,
        width: 500,
        height: 300
      });
    });

    it('should recalculate 1x3 horizontal split dimensions evenly across 3 slots', () => {
      // 3 columns, 1 row. Gap = 6px. Width = 912.
      // Total gaps = 2 * 6 = 12px. Available width = 900px. Each slot = 300px.
      const gap: GridGapConfig = { columnGap: 6, rowGap: 6 };
      const container: ContainerDimensions = { width: 912, height: 400 };

      const slots = calculateViewportDimensions('1x3', container, gap);

      assert.strictEqual(slots.length, 3);
      assert.strictEqual(slots[0].width, 300);
      assert.strictEqual(slots[0].x, 0);

      assert.strictEqual(slots[1].width, 300);
      assert.strictEqual(slots[1].x, 306); // 300 + 6

      assert.strictEqual(slots[2].width, 300);
      assert.strictEqual(slots[2].x, 612); // 300 + 6 + 300 + 6

      for (const slot of slots) {
        assert.strictEqual(slot.height, 400);
        assert.strictEqual(slot.y, 0);
      }
    });

    it('should prevent viewport total dimensions from exceeding container boundary on fractional rounding', () => {
      // Width = 1000px, 3 columns, gap = 10px -> 2 gaps = 20px -> available = 980px.
      // 980 / 3 = 326.6666...
      const gap: GridGapConfig = { columnGap: 10, rowGap: 10 };
      const container: ContainerDimensions = { width: 1000, height: 500 };

      const slots = calculateViewportDimensions('1x3', container, gap);

      // Calculate total allocated span along x-axis
      const lastSlot = slots[slots.length - 1];
      const totalWidthOccupied = lastSlot.x + lastSlot.width;

      assert.ok(
        totalWidthOccupied <= container.width,
        `Allocated width ${totalWidthOccupied}px exceeds container width ${container.width}px`
      );

      for (const slot of slots) {
        assert.ok(
          Number.isInteger(slot.width) && Number.isInteger(slot.height),
          `Slot dimensions must be pixel-aligned integers. Found: ${slot.width}x${slot.height}`
        );
        assert.ok(
          Number.isInteger(slot.x) && Number.isInteger(slot.y),
          `Slot coordinates must be pixel-aligned integers. Found: (${slot.x}, ${slot.y})`
        );
      }
    });

    it('should clamp slot dimensions to zero without negative values when container collapses', () => {
      const collapsedContainer: ContainerDimensions = { width: 0, height: 0 };
      const slots = calculateViewportDimensions('2x2', collapsedContainer, gapConfig);

      assert.strictEqual(slots.length, 4);
      for (const slot of slots) {
        assert.strictEqual(slot.width, 0, 'Slot width must not be negative');
        assert.strictEqual(slot.height, 0, 'Slot height must not be negative');
        assert.strictEqual(slot.x, 0);
        assert.strictEqual(slot.y, 0);
      }
    });

    it('should fire onViewportResize callback with recalculated slots when container dimensions update', () => {
      let reportedSlots: ViewportSlot[] = [];
      let callbackInvocationCount = 0;

      const handleResize = (slots: ViewportSlot[]) => {
        reportedSlots = slots;
        callbackInvocationCount++;
      };

      const initialDimensions: ContainerDimensions = { width: 1200, height: 800 };
      renderToStaticMarkup(
        React.createElement(SplitScreenContainer, {
          layout: '2x1',
          dimensions: initialDimensions,
          gap: 10,
          onViewportResize: handleResize,
          children: (slot: ViewportSlot) =>
            React.createElement('div', { key: slot.id, 'data-width': slot.width })
        })
      );

      assert.strictEqual(callbackInvocationCount, 1);
      assert.strictEqual(reportedSlots.length, 2);
      assert.strictEqual(reportedSlots[0].width, 595); // (1200 - 10) / 2
      assert.strictEqual(reportedSlots[1].width, 595);
    });
  });

  describe('CSS Grid Template and Inline Style Generation', () => {
    it('should generate accurate CSS gridTemplateColumns and gridTemplateRows for each layout', () => {
      const template1x1 = getGridTemplate('1x1');
      assert.strictEqual(template1x1.columns, 'repeat(1, 1fr)');
      assert.strictEqual(template1x1.rows, 'repeat(1, 1fr)');
      assert.strictEqual(template1x1.slotCount, 1);

      const template2x1 = getGridTemplate('2x1');
      assert.strictEqual(template2x1.columns, 'repeat(2, 1fr)');
      assert.strictEqual(template2x1.rows, 'repeat(1, 1fr)');
      assert.strictEqual(template2x1.slotCount, 2);

      const template2x2 = getGridTemplate('2x2');
      assert.strictEqual(template2x2.columns, 'repeat(2, 1fr)');
      assert.strictEqual(template2x2.rows, 'repeat(2, 1fr)');
      assert.strictEqual(template2x2.slotCount, 4);

      const template1x3 = getGridTemplate('1x3');
      assert.strictEqual(template1x3.columns, 'repeat(3, 1fr)');
      assert.strictEqual(template1x3.rows, 'repeat(1, 1fr)');
      assert.strictEqual(template1x3.slotCount, 3);
    });

    it('should inject CSS grid style attributes directly onto the rendered container', () => {
      const html = renderToStaticMarkup(
        React.createElement(SplitScreenContainer, {
          layout: '2x2',
          dimensions: { width: 1000, height: 1000 },
          gap: 12,
          children: () => React.createElement('div', null)
        })
      );

      // Verify inline grid styles
      assert.ok(
        html.includes('grid-template-columns:repeat(2, 1fr)') ||
        html.includes('grid-template-columns: repeat(2, 1fr)'),
        'Must contain inline grid-template-columns style'
      );
      assert.ok(
        html.includes('grid-template-rows:repeat(2, 1fr)') ||
        html.includes('grid-template-rows: repeat(2, 1fr)'),
        'Must contain inline grid-template-rows style'
      );
      assert.ok(
        html.includes('gap:12px') || html.includes('gap: 12px'),
        'Must contain inline gap style'
      );
    });

    it('should assign viewport dimensions as data attributes on each child slot container', () => {
      const html = renderToStaticMarkup(
        React.createElement(SplitScreenContainer, {
          layout: '2x1',
          dimensions: { width: 1000, height: 600 },
          gap: 0,
          children: () => React.createElement('span', null, 'chart')
        })
      );

      // Slot 0: width 500, height 600
      assert.ok(
        html.includes('data-width="500"') && html.includes('data-height="600"'),
        'Slots must render calculated data-width and data-height attributes'
      );
      assert.ok(
        html.includes('data-x="0"') && html.includes('data-x="500"'),
        'Slots must render calculated coordinates data-x'
      );
    });
  });
});