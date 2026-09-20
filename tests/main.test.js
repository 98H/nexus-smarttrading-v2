import test, { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  safeGetChildren,
  filterChildren,
  renderTree,
  mount,
} from '../src/main.js';

/**
 * Mock DOM Implementation for Node.js test environment.
 * Recreates exact browser behavior where element.children returns an HTMLCollection,
 * which does NOT possess Array.prototype methods like .filter().
 */
class MockHTMLCollection {
  constructor(items = []) {
    this.length = items.length;
    items.forEach((item, index) => {
      this[index] = item;
    });
  }

  item(index) {
    return this[index] ?? null;
  }

  [Symbol.iterator]() {
    let index = 0;
    return {
      next: () => {
        if (index < this.length) {
          return { value: this[index++], done: false };
        }
        return { value: undefined, done: true };
      },
    };
  }
  // NOTE: .filter is intentionally NOT defined to mirror the DOM specification
}

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this._childrenList = [];
    this.innerHTML = '';
    this.textContent = '';
  }

  get children() {
    return new MockHTMLCollection(this._childrenList);
  }

  appendChild(child) {
    this._childrenList.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this._childrenList.indexOf(child);
    if (idx !== -1) {
      this._childrenList.splice(idx, 1);
    }
    return child;
  }
}

class MockDocument {
  constructor() {
    this._elements = new Map();
  }

  getElementById(id) {
    return this._elements.get(id) || null;
  }

  createElement(tagName) {
    return new MockElement(tagName);
  }

  registerElement(id, element) {
    element.id = id;
    this._elements.set(id, element);
  }

  reset() {
    this._elements.clear();
  }
}

describe('STORY 5.1.1: Resolve UNCAUGHT_JAVASCRIPT_EXCEPTION (DF-CRASH-01)', () => {
  let originalDocument;
  let originalWindow;
  let mockDoc;

  beforeEach(() => {
    mockDoc = new MockDocument();
    originalDocument = globalThis.document;
    originalWindow = globalThis.window;

    globalThis.document = mockDoc;
    globalThis.window = { document: mockDoc };
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  });

  describe('Child Collection Coercion & Filtering (AC-1)', () => {
    it('should safely convert HTMLCollection into an Array and filter without throwing TypeError', () => {
      const child1 = { id: 'child-1', visible: true };
      const child2 = { id: 'child-2', visible: false };
      const child3 = { id: 'child-3', visible: true };

      const nodeWithHTMLCollection = {
        id: 'parent-node',
        children: new MockHTMLCollection([child1, child2, child3]),
      };

      // Raw HTMLCollection lacks .filter; this must not throw
      assert.strictEqual(
        typeof nodeWithHTMLCollection.children.filter,
        'undefined',
        'Precondition failed: HTMLCollection must not have native filter method'
      );

      assert.doesNotThrow(() => {
        const filtered = filterChildren(
          nodeWithHTMLCollection,
          (child) => child.visible === true
        );
        assert.strictEqual(Array.isArray(filtered), true);
        assert.strictEqual(filtered.length, 2);
        assert.deepStrictEqual(filtered, [child1, child3]);
      }, TypeError);
    });

    it('should safely coerce undefined children to an empty array', () => {
      const nodeWithUndefinedChildren = { id: 'node-undefined' };

      assert.doesNotThrow(() => {
        const children = safeGetChildren(nodeWithUndefinedChildren);
        assert.strictEqual(Array.isArray(children), true);
        assert.strictEqual(children.length, 0);

        const filtered = filterChildren(nodeWithUndefinedChildren, () => true);
        assert.deepStrictEqual(filtered, []);
      });
    });

    it('should safely coerce null children to an empty array', () => {
      const nodeWithNullChildren = {
        id: 'node-null',
        children: null,
      };

      assert.doesNotThrow(() => {
        const children = safeGetChildren(nodeWithNullChildren);
        assert.strictEqual(Array.isArray(children), true);
        assert.strictEqual(children.length, 0);

        const filtered = filterChildren(nodeWithNullChildren, () => true);
        assert.deepStrictEqual(filtered, []);
      });
    });

    it('should safely coerce a non-array plain object to an empty array or iterable array', () => {
      const nodeWithObjectChildren = {
        id: 'node-object',
        children: { invalid: 'structure' },
      };

      assert.doesNotThrow(() => {
        const children = safeGetChildren(nodeWithObjectChildren);
        assert.strictEqual(Array.isArray(children), true);

        const filtered = filterChildren(nodeWithObjectChildren, () => true);
        assert.strictEqual(Array.isArray(filtered), true);
      });
    });

    it('should preserve standard array children and filter correctly', () => {
      const standardNode = {
        id: 'node-standard',
        children: [
          { id: 1, active: true },
          { id: 2, active: false },
        ],
      };

      const result = filterChildren(standardNode, (i) => i.active);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].id, 1);
    });
  });

  describe('Component Tree Recursive Rendering (AC-1)', () => {
    it('should render a nested component tree containing mixed collections without uncaught exception', () => {
      const leafA = { id: 'leaf-a', type: 'text', text: 'Alpha' };
      const leafB = { id: 'leaf-b', type: 'text', text: 'Beta' };

      const subContainer = {
        id: 'sub-container',
        type: 'container',
        // Children is an HTMLCollection
        children: new MockHTMLCollection([leafA, leafB]),
      };

      const rootNode = {
        id: 'root',
        type: 'root',
        // Children has mixed types: sub-container, node with undefined children, node with null children
        children: [
          subContainer,
          { id: 'leaf-c', type: 'empty-node', children: undefined },
          { id: 'leaf-d', type: 'null-node', children: null },
        ],
      };

      assert.doesNotThrow(() => {
        const output = renderTree(rootNode);
        assert.ok(output, 'renderTree must return a valid output');
      }, TypeError);
    });

    it('should filter nested nodes recursively without throwing when intermediate node has HTMLCollection', () => {
      const nodeTree = {
        id: 'tree-root',
        active: true,
        children: new MockHTMLCollection([
          {
            id: 'branch-1',
            active: true,
            children: new MockHTMLCollection([
              { id: 'leaf-1', active: false },
              { id: 'leaf-2', active: true },
            ]),
          },
          {
            id: 'branch-2',
            active: false,
            children: undefined,
          },
        ]),
      };

      assert.doesNotThrow(() => {
        const activeNodes = filterChildren(nodeTree, (n) => n.active);
        assert.strictEqual(activeNodes.length, 1);
        assert.strictEqual(activeNodes[0].id, 'branch-1');
      });
    });
  });

  describe('Entrypoint Mount & DOM Invariants (AC-2)', () => {
    it('should mount into document.getElementById("app") with zero uncaught exceptions when container has DOM children', () => {
      const appContainer = new MockElement('div', 'app');
      // Existing DOM children in container represent native HTMLCollection
      const initialDomChild = new MockElement('p');
      initialDomChild.textContent = 'Loading...';
      appContainer.appendChild(initialDomChild);

      mockDoc.registerElement('app', appContainer);

      let uncaughtError = null;
      const errorHandler = (err) => {
        uncaughtError = err;
      };

      process.on('uncaughtException', errorHandler);

      try {
        assert.doesNotThrow(() => {
          const result = mount('app');
          assert.strictEqual(result.mounted, true);
        }, TypeError);

        assert.strictEqual(
          uncaughtError,
          null,
          'Mount execution produced an uncaught exception'
        );
      } finally {
        process.removeListener('uncaughtException', errorHandler);
      }
    });

    it('should wire into the active entrypoint and render UI tree without throwing if children is undefined', () => {
      const appContainer = new MockElement('div', 'app');
      mockDoc.registerElement('app', appContainer);

      assert.doesNotThrow(() => {
        const state = mount('app', {
          tree: {
            id: 'entry-root',
            children: undefined,
          },
        });
        assert.strictEqual(state.mounted, true);
        assert.strictEqual(state.element.id, 'app');
      });
    });

    it('should throw a descriptive error or handle gracefully if app container is missing, avoiding filter TypeError', () => {
      // document.getElementById('app') returns null
      assert.throws(
        () => {
          mount('non-existent-app-root');
        },
        {
          name: 'Error',
          message: /Target container.*not found/i,
        }
      );
    });
  });
});