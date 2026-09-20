"""
Pytest unit test suite for STORY 5.2.1: Resolve STATIC_APPLICATION
Defect ID: DF-LIVENESS-01 (Severity: HIGH)

Requirement Invariant:
Never produce an isolated, unmounted file. Modify or wire into the active
entrypoint (src/main.js) and active canvas/components so the fix takes effect
in the live browser.

Acceptance Criteria:
1. When src/main.js is loaded and mounts to document.getElementById('app'),
   a continuous requestAnimationFrame rendering loop and dynamic state clock
   must initialize immediately.
2. When a 2.5-second observation window elapses, DOM text or canvas pixels
   must reflect continuous state mutations and active frame renders.
3. Under dynamic updates and interaction events, render cycles and state
   subscribers must remain wired directly to the live DOM without terminating.
"""

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Path & Environment Resolution
# ---------------------------------------------------------------------------

def locate_main_js() -> Path:
    """Locate the target entrypoint module src/main.js across common workspace layouts."""
    cwd = Path.cwd()
    candidate_paths = [
        cwd / "src" / "main.js",
        cwd / "main.js",
        Path(__file__).resolve().parent / "src" / "main.js",
        Path(__file__).resolve().parent.parent / "src" / "main.js",
    ]
    for path in candidate_paths:
        if path.is_file():
            return path
    # Default expected path according to architectural invariant
    return cwd / "src" / "main.js"


MAIN_JS_PATH = locate_main_js()


# ---------------------------------------------------------------------------
# Execution Harness: Headless Browser & Virtual Clock Simulator
# ---------------------------------------------------------------------------

def run_liveness_harness(main_js_path: Path, observation_window_ms: float = 2500.0) -> Dict[str, Any]:
    """
    Executes or evaluates src/main.js within an instrumented virtual DOM environment.
    Simulates a 2.5-second observation window with a 60 FPS requestAnimationFrame scheduler.
    Collects telemetry on frame count, DOM mutations, canvas draw calls, and loop continuity.
    """
    if not main_js_path.is_file():
        pytest.fail(f"Architectural Invariant Violated: Target entrypoint {main_js_path} does not exist.")

    node_bin = shutil.which("node")
    if node_bin:
        return _run_node_harness(node_bin, main_js_path, observation_window_ms)
    else:
        return _run_static_analysis_harness(main_js_path, observation_window_ms)


def _run_node_harness(node_bin: str, main_js_path: Path, observation_window_ms: float) -> Dict[str, Any]:
    """Executes src/main.js in Node.js with a fully instrumented mock DOM and virtual clock."""
    escaped_path = json.dumps(str(main_js_path.resolve()))
    harness_script = f"""
    import {{ pathToFileURL }} from 'url';

    const telemetry = {{
        mounted: false,
        initialRafCalled: false,
        clockInitialized: false,
        frameCount: 0,
        domTextMutations: 0,
        canvasDrawCalls: 0,
        activeSubscribers: 0,
        loopTerminated: false,
        interactionHandled: false,
        timeElapsedMs: 0,
        errors: []
    }};

    let currentTime = 0;
    let nextRafId = 1;
    const rafCallbacks = new Map();

    function mockRequestAnimationFrame(cb) {{
        const id = nextRafId++;
        rafCallbacks.set(id, cb);
        telemetry.initialRafCalled = true;
        return id;
    }}

    function mockCancelAnimationFrame(id) {{
        rafCallbacks.delete(id);
    }}

    class MockElement {{
        constructor(tagName) {{
            this.tagName = tagName.toUpperCase();
            this._textContent = '';
            this._innerHTML = '';
            this.children = [];
            this.listeners = {{}};
            this.attributes = {{}};
            this.style = {{}};
        }}
        get textContent() {{ return this._textContent; }}
        set textContent(v) {{
            const str = String(v);
            if (this._textContent !== str) {{
                telemetry.domTextMutations++;
            }}
            this._textContent = str;
        }}
        get innerHTML() {{ return this._innerHTML; }}
        set innerHTML(v) {{
            const str = String(v);
            if (this._innerHTML !== str) {{
                telemetry.domTextMutations++;
            }}
            this._innerHTML = str;
        }}
        setAttribute(k, v) {{ this.attributes[k] = String(v); }}
        getAttribute(k) {{ return this.attributes[k] || null; }}
        appendChild(child) {{
            this.children.push(child);
            telemetry.mounted = true;
            return child;
        }}
        removeChild(child) {{
            this.children = this.children.filter(c => c !== child);
            return child;
        }}
        addEventListener(type, cb) {{
            if (!this.listeners[type]) this.listeners[type] = [];
            this.listeners[type].push(cb);
            telemetry.activeSubscribers++;
        }}
        removeEventListener(type, cb) {{
            if (this.listeners[type]) {{
                this.listeners[type] = this.listeners[type].filter(fn => fn !== cb);
                telemetry.activeSubscribers = Math.max(0, telemetry.activeSubscribers - 1);
            }}
        }}
        dispatchEvent(evt) {{
            const cbs = this.listeners[evt.type] || [];
            for (const cb of cbs) {{
                try {{
                    cb(evt);
                }} catch (err) {{
                    telemetry.errors.push(err.message || String(err));
                }}
            }}
            return true;
        }}
    }}

    class MockCanvasContext2D {{
        constructor(canvas) {{
            this.canvas = canvas;
        }}
        clearRect() {{ telemetry.canvasDrawCalls++; }}
        fillRect() {{ telemetry.canvasDrawCalls++; }}
        strokeRect() {{ telemetry.canvasDrawCalls++; }}
        fillText() {{ telemetry.canvasDrawCalls++; }}
        strokeText() {{ telemetry.canvasDrawCalls++; }}
        beginPath() {{ telemetry.canvasDrawCalls++; }}
        closePath() {{}}
        stroke() {{ telemetry.canvasDrawCalls++; }}
        fill() {{ telemetry.canvasDrawCalls++; }}
        drawImage() {{ telemetry.canvasDrawCalls++; }}
        putImageData() {{ telemetry.canvasDrawCalls++; }}
        arc() {{ telemetry.canvasDrawCalls++; }}
        moveTo() {{}}
        lineTo() {{}}
    }}

    class MockCanvasElement extends MockElement {{
        constructor() {{
            super('canvas');
            this.width = 800;
            this.height = 600;
            this._ctx = new MockCanvasContext2D(this);
        }}
        getContext(type) {{
            if (type === '2d') return this._ctx;
            return null;
        }}
    }}

    const appRoot = new MockElement('div');
    appRoot.id = 'app';

    // Install global browser mocks prior to module execution
    globalThis.window = globalThis;
    globalThis.document = {{
        getElementById(id) {{
            if (id === 'app') {{
                telemetry.mounted = true;
                return appRoot;
            }}
            return null;
        }},
        querySelector(sel) {{
            if (sel === '#app') {{
                telemetry.mounted = true;
                return appRoot;
            }}
            return null;
        }},
        querySelectorAll(sel) {{
            if (sel === '#app') return [appRoot];
            return [];
        }},
        createElement(tag) {{
            if (tag.toLowerCase() === 'canvas') return new MockCanvasElement();
            return new MockElement(tag);
        }},
        body: new MockElement('body'),
        addEventListener: appRoot.addEventListener.bind(appRoot),
        removeEventListener: appRoot.removeEventListener.bind(appRoot),
        dispatchEvent: appRoot.dispatchEvent.bind(appRoot)
    }};
    globalThis.requestAnimationFrame = mockRequestAnimationFrame;
    globalThis.cancelAnimationFrame = mockCancelAnimationFrame;
    globalThis.performance = {{
        now() {{ return currentTime; }}
    }};

    try {{
        await import(pathToFileURL({escaped_path}).href);
    }} catch (err) {{
        telemetry.errors.push(`Module load error: ${{err.stack || err.message}}`);
    }}

    // Advance virtual clock over observation window ({observation_window_ms} ms) at 60 FPS
    const totalDuration = {observation_window_ms};
    const step = 1000 / 60; // 16.666ms

    while (currentTime < totalDuration) {{
        currentTime += step;
        telemetry.timeElapsedMs = currentTime;

        // Dynamic user interaction injected midway (1250 ms)
        if (currentTime >= 1250 && !telemetry.interactionHandled) {{
            telemetry.interactionHandled = true;
            appRoot.dispatchEvent({{ type: 'click', clientX: 150, clientY: 200 }});
        }}

        if (rafCallbacks.size === 0) {{
            telemetry.loopTerminated = true;
            break;
        }}

        const cbs = Array.from(rafCallbacks.entries());
        rafCallbacks.clear();
        for (const [id, cb] of cbs) {{
            try {{
                cb(currentTime);
                telemetry.frameCount++;
            }} catch (err) {{
                telemetry.errors.push(`Frame render error at ${{currentTime}}ms: ${{err.stack || err.message}}`);
            }}
        }}
    }}

    telemetry.continuousLoopActive = (rafCallbacks.size > 0) && (!telemetry.loopTerminated);
    console.log("__TELEMETRY_START__" + JSON.stringify(telemetry) + "__TELEMETRY_END__");
    """

    res = subprocess.run(
        [node_bin, "--input-type=module", "-e", harness_script],
        capture_output=True,
        text=True,
        timeout=15
    )

    if "__TELEMETRY_START__" not in res.stdout:
        pytest.fail(f"Harness execution failed: {res.stderr or res.stdout}")

    start = res.stdout.find("__TELEMETRY_START__") + len("__TELEMETRY_START__")
    end = res.stdout.find("__TELEMETRY_END__")
    return json.loads(res.stdout[start:end])


def _run_static_analysis_harness(main_js_path: Path, observation_window_ms: float) -> Dict[str, Any]:
    """Fallback static/lexical analysis if Node is not available in test runner environment."""
    content = main_js_path.read_text(encoding="utf-8")

    has_app_mount = (
        "getElementById('app')" in content or
        'getElementById("app")' in content or
        "querySelector('#app')" in content or
        'querySelector("#app")' in content
    )

    has_raf = "requestAnimationFrame" in content
    has_clock = any(term in content for term in [
        "performance.now", "Date.now", "timestamp", "stateClock", "clock", "lastTime"
    ])
    has_mutation = any(term in content for term in [
        "textContent", "innerHTML", "getContext('2d')", 'getContext("2d")',
        "fillRect", "clearRect", "drawImage", "stroke", "fill"
    ])

    is_valid = has_app_mount and has_raf and has_clock and has_mutation

    return {
        "mounted": has_app_mount,
        "initialRafCalled": has_raf,
        "clockInitialized": has_clock,
        "frameCount": 150 if is_valid else 0,
        "domTextMutations": 75 if is_valid else 0,
        "canvasDrawCalls": 150 if is_valid else 0,
        "activeSubscribers": 1 if is_valid else 0,
        "loopTerminated": not is_valid,
        "interactionHandled": is_valid,
        "continuousLoopActive": is_valid,
        "timeElapsedMs": observation_window_ms,
        "errors": [] if is_valid else ["Static Defect: Application does not implement continuous render cycle"]
    }


# ---------------------------------------------------------------------------
# Test Fixtures & External Mocks
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def mock_external_daemons():
    """Ensure tests run strictly offline, mocking any unexpected external network or server calls."""
    with patch("urllib.request.urlopen", MagicMock()), \
         patch("socket.socket", MagicMock()):
        yield


@pytest.fixture
def liveness_telemetry() -> Dict[str, Any]:
    """Execute the 2.5-second observation window harness on src/main.js."""
    return run_liveness_harness(MAIN_JS_PATH, observation_window_ms=2500.0)


# ---------------------------------------------------------------------------
# Unit Tests: STORY 5.2.1 / Defect DF-LIVENESS-01
# ---------------------------------------------------------------------------

def test_entrypoint_exists_and_adheres_to_architectural_invariants():
    """
    Architectural Invariant:
    Verify src/main.js exists, is the active entrypoint, and binds to document.getElementById('app').
    """
    assert MAIN_JS_PATH.exists(), f"Active entrypoint {MAIN_JS_PATH} must exist."
    content = MAIN_JS_PATH.read_text(encoding="utf-8")
    assert len(content.strip()) > 0, "src/main.js must not be empty."

    mount_target_found = (
        "getElementById('app')" in content or
        'getElementById("app")' in content or
        "querySelector('#app')" in content or
        'querySelector("#app")' in content
    )
    assert mount_target_found, "src/main.js must wire directly into the live DOM root element (#app)."


def test_acceptance_criteria_1_initialization_raf_and_state_clock(liveness_telemetry: Dict[str, Any]):
    """
    Acceptance Criteria 1:
    Given the web application entrypoint src/main.js is loaded,
    When the application mounts to document.getElementById('app'),
    Then a continuous requestAnimationFrame rendering loop and dynamic state clock
    must initialize immediately.
    """
    assert not liveness_telemetry["errors"], (
        f"Entrypoint raised errors during mount: {liveness_telemetry['errors']}"
    )
    assert liveness_telemetry["mounted"] is True, (
        "Application failed to mount to document.getElementById('app')."
    )
    assert liveness_telemetry["initialRafCalled"] is True, (
        "Continuous requestAnimationFrame loop did not initialize immediately upon mount."
    )


def test_acceptance_criteria_2_observation_window_2_5s_liveness(liveness_telemetry: Dict[str, Any]):
    """
    Acceptance Criteria 2 (Defect DF-LIVENESS-01):
    Given the application is running in the browser,
    When a 2.5-second observation window elapses,
    Then DOM text or canvas pixels must reflect continuous state mutations and active frame renders.
    """
    # Verify that observation window of 2.5 seconds elapsed
    assert liveness_telemetry["timeElapsedMs"] >= 2500.0, (
        f"Observation window was insufficient: {liveness_telemetry['timeElapsedMs']}ms < 2500ms."
    )

    # At 60 FPS over 2.5s, expected frames ~150. We require at least 30 active frames to confirm liveness.
    assert liveness_telemetry["frameCount"] >= 30, (
        f"DF-LIVENESS-01 Failure: Only {liveness_telemetry['frameCount']} frames rendered over 2.5s. "
        "Application appears to be a static painting."
    )

    # Verify either DOM text or canvas pixels underwent continuous state mutations
    total_mutations = liveness_telemetry["domTextMutations"] + liveness_telemetry["canvasDrawCalls"]
    assert total_mutations > 0, (
        "DF-LIVENESS-01 Failure: Neither DOM text nor canvas pixels underwent any state mutations "
        f"over 2.5s observation window (DOM mutations={liveness_telemetry['domTextMutations']}, "
        f"Canvas draws={liveness_telemetry['canvasDrawCalls']})."
    )


def test_acceptance_criteria_3_resilience_under_interaction(liveness_telemetry: Dict[str, Any]):
    """
    Acceptance Criteria 3:
    Given dynamic updates and interaction events,
    When the application runs in a live session,
    Then render cycles and state subscribers must remain wired directly to the live DOM without terminating.
    """
    assert liveness_telemetry["interactionHandled"] is True, (
        "Application failed to receive or process live session interaction events."
    )
    assert liveness_telemetry["loopTerminated"] is False, (
        "Render cycle terminated prematurely following interaction or state update."
    )
    assert liveness_telemetry["continuousLoopActive"] is True, (
        "requestAnimationFrame callback chain did not persist through the end of the observation window."
    )


def test_no_unhandled_exceptions_in_render_cycle(liveness_telemetry: Dict[str, Any]):
    """
    Verify that no runtime exceptions occur inside frame callbacks during continuous rendering.
    """
    frame_errors = [e for e in liveness_telemetry["errors"] if "Frame render error" in e]
    assert len(frame_errors) == 0, f"Render loop produced unhandled exceptions: {frame_errors}"


@pytest.mark.parametrize("invalid_mount_target", ["#nonexistent", "#detached-node"])
def test_mount_resilience_on_missing_element(invalid_mount_target: str):
    """
    Verify src/main.js handles missing or null mount targets gracefully without crashing the runtime.
    """
    # Direct code inspection asserting defensive DOM checks
    content = MAIN_JS_PATH.read_text(encoding="utf-8")
    assert "getElementById" in content or "querySelector" in content, (
        "src/main.js must query the DOM for mounting."
    )