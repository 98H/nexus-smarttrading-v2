import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  PlotPipeline,
  type WorkerScriptResult,
  type WorkerPlotLineOutput,
  type WorkerPlotShapeOutput
} from '../../src/chart/pipelines/plotPipeline.ts';

import {
  PlotOverlayManager,
  AuxiliaryOverlayType,
  type WebGLRenderLoop,
  type RenderContext,
  type AuxiliaryOverlay
} from '../../src/chart/webgl/PlotOverlayManager.ts';

/**
 * Minimal headless WebGL2 context mock for Node.js unit test runtime.
 * Implements buffer management, state tracking, and draw calls required by PlotOverlayManager.
 */
function createMockWebGLContext() {
  let idCounter = 1;
  return {
    ARRAY_BUFFER: 0x8892,
    STATIC_DRAW: 0x88e4,
    DYNAMIC_DRAW: 0x88e8,
    FLOAT: 0x1406,
    TRIANGLES: 0x0004,
    LINE_STRIP: 0x0003,

    createdBuffers: [] as any[],
    deletedBuffers: [] as any[],
    boundBuffers: new Map<number, any>(),
    bufferDataCalls: [] as { target: number; data: Float32Array; usage: number }[],
    drawArraysCalls: [] as { mode: number; first: number; count: number }[],
    drawArraysInstancedCalls: [] as { mode: number; first: number; count: number; instanceCount: number }[],

    createBuffer() {
      const buffer = { id: idCounter++, deleted: false };
      this.createdBuffers.push(buffer);
      return buffer;
    },
    deleteBuffer(buffer: any) {
      buffer.deleted = true;
      this.deletedBuffers.push(buffer);
    },
    bindBuffer(target: number, buffer: any) {
      this.boundBuffers.set(target, buffer);
    },
    bufferData(target: number, data: Float32Array, usage: number) {
      this.bufferDataCalls.push({ target, data, usage });
    },
    enableVertexAttribArray(_index: number) {},
    vertexAttribPointer(_index: number, _size: number, _type: number, _normalized: boolean, _stride: number, _offset: number) {},
    vertexAttribDivisor(_index: number, _divisor: number) {},
    drawArrays(mode: number, first: number, count: number) {
      this.drawArraysCalls.push({ mode, first, count });
    },
    drawArraysInstanced(mode: number, first: number, count: number, instanceCount: number) {
      this.drawArraysInstancedCalls.push({ mode, first, count, instanceCount });
    },
    useProgram(_program: any) {}
  };
}

/**
 * Mock WebGLRenderLoop capable of simulating render frames.
 */
class MockRenderLoop implements WebGLRenderLoop {
  private callbacks: Array<(ctx: RenderContext) => void> = [];
  public isRunning = false;

  addAuxiliaryOverlayPass(cb: (ctx: RenderContext) => void): () => void {
    this.callbacks.push(cb);
    return () => {
      this.callbacks = this.callbacks.filter(c => c !== cb);
    };
  }

  triggerFrame(gl: any, viewMatrix: Float32Array = new Float32Array(16), projectionMatrix: Float32Array = new Float32Array(16)): void {
    const context: RenderContext = {
      gl,
      viewMatrix,
      projectionMatrix,
      viewport: { x: 0, y: 0, width: 800, height: 600 },
      timeRange: { from: 1700000000, to: 1700000240 },
      priceRange: { min: 90.0, max: 110.0 }
    };

    for (const callback of this.callbacks) {
      callback(context);
    }
  }

  getSubscriberCount(): number {
    return this.callbacks.length;
  }
}

describe('Story 4.3.2: Dynamic Plot Pipeline to WebGL Series', () => {
  let glMock: ReturnType<typeof createMockWebGLContext>;
  let renderLoop: MockRenderLoop;
  let overlayManager: PlotOverlayManager;
  let pipeline: PlotPipeline;

  const validLinePlot: WorkerPlotLineOutput = {
    id: 'plot_fast_ema',
    title: 'Fast EMA',
    type: 'line',
    style: {
      color: '#2196F3',
      lineWidth: 2.0
    },
    points: [
      { time: 1700000000, value: 100.5 },
      { time: 1700000060, value: 101.2 },
      { time: 1700000120, value: 102.0 },
      { time: 1700000180, value: null }, // Discontinuity/gap
      { time: 1700000240, value: 103.5 }
    ]
  };

  const validShapePlot: WorkerPlotShapeOutput = {
    id: 'plotshape_buy_signals',
    title: 'Buy Signals',
    shape: 'triangleUp',
    style: {
      location: 'belowBar',
      color: '#00E676',
      size: 12.0
    },
    points: [
      { time: 1700000060, value: 100.8, text: 'BUY' },
      { time: 1700000240, value: 103.0, text: '' }
    ]
  };

  beforeEach(() => {
    glMock = createMockWebGLContext();
    renderLoop = new MockRenderLoop();
    overlayManager = new PlotOverlayManager(glMock as any);
    pipeline = new PlotPipeline({ overlayManager });
  });

  describe('Worker Result Processing (PlotPipeline)', () => {
    it('should transform plot() line outputs into structured WebGL vertex data', () => {
      const workerPayload: WorkerScriptResult = {
        scriptId: 'script-test-1',
        executionTimeMs: 12.4,
        plots: [validLinePlot],
        plotShapes: []
      };

      pipeline.consumeWorkerResults(workerPayload);

      const overlay = overlayManager.getOverlay('plot_fast_ema');
      assert.ok(overlay, 'Line overlay must be registered');
      assert.equal(overlay.type, AuxiliaryOverlayType.LINE);
      assert.equal(overlay.id, 'plot_fast_ema');
      assert.equal(overlay.title, 'Fast EMA');

      const bufferData = overlayManager.getBufferData('plot_fast_ema');
      assert.ok(bufferData instanceof Float32Array, 'Buffer data must be a Float32Array');

      // 5 points: (time, value) pairs. Discontinuity should emit NaN value
      assert.equal(bufferData.length, 10, 'Expected 10 floats (5 points x 2 floats)');
      assert.equal(bufferData[0], 1700000000);
      assert.equal(bufferData[1], 100.5);
      assert.equal(bufferData[6], 1700000180);
      assert.ok(Number.isNaN(bufferData[7]), 'Null values must convert to NaN to split line strip');
    });

    it('should transform plotshape() outputs into instanced shape primitives with position and metadata', () => {
      const workerPayload: WorkerScriptResult = {
        scriptId: 'script-test-2',
        executionTimeMs: 8.5,
        plots: [],
        plotShapes: [validShapePlot]
      };

      pipeline.consumeWorkerResults(workerPayload);

      const overlay = overlayManager.getOverlay('plotshape_buy_signals');
      assert.ok(overlay, 'Shape overlay must be registered');
      assert.equal(overlay.type, AuxiliaryOverlayType.SHAPE);
      assert.equal(overlay.id, 'plotshape_buy_signals');

      const shapeInstances = overlayManager.getShapeInstanceData('plotshape_buy_signals');
      assert.ok(shapeInstances, 'Shape instance data must exist');
      assert.equal(shapeInstances.length, 2, 'Should contain 2 shape instances');
      assert.equal(shapeInstances[0].shapeType, 'triangleUp');
      assert.equal(shapeInstances[0].location, 'belowBar');
      assert.equal(shapeInstances[0].time, 1700000060);
      assert.equal(shapeInstances[0].value, 100.8);
      assert.equal(shapeInstances[0].text, 'BUY');
    });

    it('should reject malformed worker payloads without throwing or corrupting existing overlays', () => {
      const invalidPayload = {
        scriptId: 'script-corrupt',
        plots: [{ id: '', points: 'invalid-data-not-array' }], // Corrupt line
        plotShapes: null // Corrupt shapes
      } as unknown as WorkerScriptResult;

      assert.doesNotThrow(() => {
        pipeline.consumeWorkerResults(invalidPayload);
      });

      assert.equal(overlayManager.getOverlayCount(), 0, 'No overlays should be added on malformed input');
    });
  });

  describe('WebGL Auxiliary Overlay Management (PlotOverlayManager)', () => {
    it('should dynamically bind auxiliary overlays to the WebGL render loop upon registration', () => {
      assert.equal(renderLoop.getSubscriberCount(), 0, 'Initial render loop should have 0 auxiliary subscribers');

      overlayManager.bindToRenderLoop(renderLoop);
      assert.equal(renderLoop.getSubscriberCount(), 1, 'PlotOverlayManager should attach auxiliary pass to render loop');

      const workerPayload: WorkerScriptResult = {
        scriptId: 'script-test-3',
        executionTimeMs: 5.1,
        plots: [validLinePlot],
        plotShapes: [validShapePlot]
      };

      pipeline.consumeWorkerResults(workerPayload);

      assert.equal(overlayManager.getOverlayCount(), 2);
      const activeOverlays = overlayManager.getAllOverlays();
      assert.equal(activeOverlays.length, 2);

      // Trigger WebGL Frame
      renderLoop.triggerFrame(glMock);

      // Verify that drawArrays was invoked for the line overlay
      assert.ok(glMock.drawArraysCalls.length > 0, 'Expected WebGL drawArrays calls for line overlay');
      const lineDraw = glMock.drawArraysCalls[0];
      assert.equal(lineDraw.mode, glMock.LINE_STRIP);
      assert.equal(lineDraw.count, 5);

      // Verify that drawArraysInstanced was invoked for the shape overlay
      assert.ok(glMock.drawArraysInstancedCalls.length > 0, 'Expected WebGL drawArraysInstanced calls for shape overlay');
      const shapeDraw = glMock.drawArraysInstancedCalls[0];
      assert.equal(shapeDraw.instanceCount, 2);
    });

    it('should update existing WebGL buffers in-place without leaking buffers on repeated worker ticks', () => {
      overlayManager.bindToRenderLoop(renderLoop);

      const initialPayload: WorkerScriptResult = {
        scriptId: 'script-test-4',
        executionTimeMs: 4.2,
        plots: [validLinePlot],
        plotShapes: []
      };

      pipeline.consumeWorkerResults(initialPayload);
      const initialBufferCount = glMock.createdBuffers.length;
      assert.equal(initialBufferCount, 1, 'Initial line plot creates 1 WebGL buffer');

      const updatedPayload: WorkerScriptResult = {
        scriptId: 'script-test-4',
        executionTimeMs: 4.0,
        plots: [
          {
            ...validLinePlot,
            points: [
              ...validLinePlot.points,
              { time: 1700000300, value: 104.2 }
            ]
          }
        ],
        plotShapes: []
      };

      // Subsequent execution with updated points
      pipeline.consumeWorkerResults(updatedPayload);

      assert.equal(overlayManager.getOverlayCount(), 1, 'Overlay count should remain 1');
      assert.equal(glMock.createdBuffers.length, initialBufferCount, 'Should reuse existing buffer without creating new one');

      const bufferUpdates = glMock.bufferDataCalls.filter(c => c.target === glMock.ARRAY_BUFFER);
      assert.ok(bufferUpdates.length >= 2, 'gl.bufferData must be invoked to stream updated point vertices');

      const latestBuffer = bufferUpdates[bufferUpdates.length - 1];
      assert.equal(latestBuffer.data.length, 12, 'Buffer should now hold 6 points (12 floats)');
    });

    it('should properly dispose WebGL buffers when overlays are removed or replaced', () => {
      pipeline.consumeWorkerResults({
        scriptId: 'script-test-5',
        executionTimeMs: 3.1,
        plots: [validLinePlot],
        plotShapes: [validShapePlot]
      });

      assert.equal(overlayManager.getOverlayCount(), 2);
      assert.ok(glMock.createdBuffers.length >= 2, 'Allocated WebGL buffers for line and shapes');

      // Script re-executes with only lines, shape overlay removed
      pipeline.consumeWorkerResults({
        scriptId: 'script-test-5',
        executionTimeMs: 2.9,
        plots: [validLinePlot],
        plotShapes: []
      });

      assert.equal(overlayManager.getOverlayCount(), 1);
      assert.equal(overlayManager.hasOverlay('plotshape_buy_signals'), false);
      assert.ok(glMock.deletedBuffers.length >= 1, 'Orphaned shape buffer must be freed via gl.deleteBuffer');
    });

    it('should maintain auxiliary rendering layer order: lines rendered prior to shape badges', () => {
      const renderExecutionOrder: string[] = [];

      overlayManager.bindToRenderLoop(renderLoop);

      // Track render ordering via intercepting overlays
      pipeline.consumeWorkerResults({
        scriptId: 'script-test-6',
        executionTimeMs: 4.8,
        plots: [validLinePlot],
        plotShapes: [validShapePlot]
      });

      const lineOverlay = overlayManager.getOverlay('plot_fast_ema') as AuxiliaryOverlay;
      const shapeOverlay = overlayManager.getOverlay('plotshape_buy_signals') as AuxiliaryOverlay;

      const originalLineRender = lineOverlay.render.bind(lineOverlay);
      lineOverlay.render = (ctx: RenderContext) => {
        renderExecutionOrder.push('LINE_PASS');
        originalLineRender(ctx);
      };

      const originalShapeRender = shapeOverlay.render.bind(shapeOverlay);
      shapeOverlay.render = (ctx: RenderContext) => {
        renderExecutionOrder.push('SHAPE_PASS');
        originalShapeRender(ctx);
      };

      renderLoop.triggerFrame(glMock);

      assert.deepEqual(
        renderExecutionOrder,
        ['LINE_PASS', 'SHAPE_PASS'],
        'Lines must render before shapes so badges superimpose on lines cleanly'
      );
    });

    it('should toggle visibility of auxiliary overlays without reallocating WebGL state', () => {
      overlayManager.bindToRenderLoop(renderLoop);

      pipeline.consumeWorkerResults({
        scriptId: 'script-test-7',
        executionTimeMs: 3.5,
        plots: [validLinePlot],
        plotShapes: []
      });

      overlayManager.setOverlayVisibility('plot_fast_ema', false);

      glMock.drawArraysCalls = [];
      renderLoop.triggerFrame(glMock);

      assert.equal(glMock.drawArraysCalls.length, 0, 'Hidden overlay should skip WebGL draw call');

      overlayManager.setOverlayVisibility('plot_fast_ema', true);
      renderLoop.triggerFrame(glMock);

      assert.equal(glMock.drawArraysCalls.length, 1, 'Visible overlay should execute WebGL draw call');
    });

    it('should cleanly unbind from render loop when manager is disposed', () => {
      const unbind = overlayManager.bindToRenderLoop(renderLoop);
      assert.equal(renderLoop.getSubscriberCount(), 1);

      overlayManager.dispose();

      assert.equal(renderLoop.getSubscriberCount(), 0, 'Render pass subscriber should be detached');
      assert.equal(overlayManager.getOverlayCount(), 0, 'All overlays must be cleared');
      assert.ok(glMock.deletedBuffers.length >= 0);
    });
  });
});