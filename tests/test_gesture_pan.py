"""
Unit tests for STORY 1.1.1: Resolve UNRESPONSIVE_CANVAS_PAN (Defect ID: DF-GESTURE-01).

Validates interactive canvas panning via mouse drag gestures across:
- src/ui/gesture_handler.py
- src/ui/viewport.py
- src/ui/canvas.py
"""

from typing import Tuple
from unittest.mock import MagicMock, call, create_autospec
import pytest

from src.ui.canvas import Canvas
from src.ui.gesture_handler import GestureHandler
from src.ui.viewport import Viewport


# ============================================================================
# Fixtures
# ============================================================================

@pytest.fixture
def viewport() -> Viewport:
    """Fixture providing an initialized Viewport with baseline matrix."""
    return Viewport(width=800.0, height=600.0, offset_x=0.0, offset_y=0.0, zoom=1.0)


@pytest.fixture
def mock_canvas(viewport: Viewport) -> MagicMock:
    """Fixture providing a mock Canvas with linked Viewport."""
    canvas = create_autospec(Canvas, instance=True)
    canvas.viewport = viewport
    canvas.width = 800.0
    canvas.height = 600.0
    canvas.redraw = MagicMock()
    canvas.is_in_bounds.side_effect = (
        lambda x, y: 0.0 <= x <= canvas.width and 0.0 <= y <= canvas.height
    )
    return canvas


@pytest.fixture
def gesture_handler(mock_canvas: MagicMock, viewport: Viewport) -> GestureHandler:
    """Fixture providing an active GestureHandler attached to mock canvas and viewport."""
    return GestureHandler(canvas=mock_canvas, viewport=viewport)


# ============================================================================
# Viewport Unit Tests (src/ui/viewport.py)
# ============================================================================

class TestViewport:
    """Unit tests for Viewport transformation matrix and offset updates."""

    def test_viewport_initial_baseline_matrix(self, viewport: Viewport):
        """Ensure Viewport starts with zero offset and baseline identity-scale matrix."""
        assert viewport.offset_x == 0.0
        assert viewport.offset_y == 0.0
        assert viewport.zoom == 1.0

        # Matrix expected format: 3x3 affine transformation matrix [[sx, 0, tx], [0, sy, ty], [0, 0, 1]]
        matrix = viewport.get_matrix()
        assert matrix[0][2] == pytest.approx(0.0)
        assert matrix[1][2] == pytest.approx(0.0)
        assert matrix[0][0] == pytest.approx(1.0)
        assert matrix[1][1] == pytest.approx(1.0)

    def test_viewport_pan_updates_offset_and_matrix(self, viewport: Viewport):
        """Verify panning updates offset coordinates and translation row of the matrix."""
        dx, dy = 120.5, -45.25
        viewport.pan(dx=dx, dy=dy)

        assert viewport.offset_x == pytest.approx(120.5)
        assert viewport.offset_y == pytest.approx(-45.25)

        matrix = viewport.get_matrix()
        assert matrix[0][2] == pytest.approx(120.5)
        assert matrix[1][2] == pytest.approx(-45.25)

    def test_viewport_consecutive_pans_accumulate_without_drift(self, viewport: Viewport):
        """Verify multiple consecutive pan operations accumulate deterministically without drift."""
        deltas = [(10.0, 5.0), (-3.0, 2.0), (15.5, -7.25), (-22.5, 0.25)]
        expected_x = 0.0
        expected_y = 0.0

        for dx, dy in deltas:
            viewport.pan(dx=dx, dy=dy)
            expected_x += dx
            expected_y += dy

        assert viewport.offset_x == pytest.approx(expected_x)
        assert viewport.offset_y == pytest.approx(expected_y)

        matrix = viewport.get_matrix()
        assert matrix[0][2] == pytest.approx(expected_x)
        assert matrix[1][2] == pytest.approx(expected_y)


# ============================================================================
# Canvas Unit Tests (src/ui/canvas.py)
# ============================================================================

class TestCanvas:
    """Unit tests for Canvas coordinate space and redraw invocations."""

    def test_canvas_bounds_verification(self):
        """Verify canvas properly evaluates whether coordinates lie within boundaries."""
        canvas = Canvas(width=1024.0, height=768.0)

        assert canvas.is_in_bounds(0.0, 0.0) is True
        assert canvas.is_in_bounds(512.0, 384.0) is True
        assert canvas.is_in_bounds(1024.0, 768.0) is True

        assert canvas.is_in_bounds(-0.1, 100.0) is False
        assert canvas.is_in_bounds(100.0, -0.1) is False
        assert canvas.is_in_bounds(1024.1, 100.0) is False
        assert canvas.is_in_bounds(100.0, 768.1) is False

    def test_canvas_redraw_invokes_render_pipeline(self):
        """Verify canvas redraw flag/pipeline execution."""
        canvas = Canvas(width=800.0, height=600.0)
        canvas.render = MagicMock()

        canvas.redraw()
        canvas.render.assert_called_once()


# ============================================================================
# GestureHandler Unit Tests (src/ui/gesture_handler.py)
# ============================================================================

class TestGestureHandlerPanWorkflow:
    """
    Acceptance criteria tests for Defect DF-GESTURE-01.
    Resolves UNRESPONSIVE_CANVAS_PAN when dragging across canvas.
    """

    def test_mouse_drag_updates_viewport_offset_and_triggers_redraw(
        self, gesture_handler: GestureHandler, mock_canvas: MagicMock, viewport: Viewport
    ):
        """
        Acceptance Criteria 1:
        Given the chart canvas is initialized with a baseline viewport matrix,
        When a mouse drag event sequence (mousedown, mousemove) with delta coordinates
             (dx, dy) is dispatched across the canvas,
        Then the viewport matrix offset must update by the corresponding delta
             and trigger a canvas redraw.
        """
        start_x, start_y = 100.0, 150.0
        target_x, target_y = 165.0, 195.0
        expected_dx = target_x - start_x  # +65.0
        expected_dy = target_y - start_y  # +45.0

        # Act: initiate drag
        gesture_handler.handle_mouse_down(x=start_x, y=start_y, button=1)
        assert gesture_handler.is_panning is True

        # Act: move cursor to dispatch drag delta
        gesture_handler.handle_mouse_move(x=target_x, y=target_y)

        # Assert: viewport offsets updated
        assert viewport.offset_x == pytest.approx(expected_dx)
        assert viewport.offset_y == pytest.approx(expected_dy)

        # Assert: transformation matrix updated
        matrix = viewport.get_matrix()
        assert matrix[0][2] == pytest.approx(expected_dx)
        assert matrix[1][2] == pytest.approx(expected_dy)

        # Assert: canvas redraw was requested
        mock_canvas.redraw.assert_called_once()

    def test_mouse_move_without_prior_mouse_down_does_not_pan(
        self, gesture_handler: GestureHandler, mock_canvas: MagicMock, viewport: Viewport
    ):
        """Verify hovering without mousedown produces zero offset changes and no redraws."""
        gesture_handler.handle_mouse_move(x=200.0, y=200.0)

        assert gesture_handler.is_panning is False
        assert viewport.offset_x == 0.0
        assert viewport.offset_y == 0.0
        mock_canvas.redraw.assert_not_called()

    def test_zero_delta_mouse_move_does_not_trigger_redundant_redraw(
        self, gesture_handler: GestureHandler, mock_canvas: MagicMock, viewport: Viewport
    ):
        """Verify identical sequential mouse coordinates do not issue unnecessary redraws."""
        gesture_handler.handle_mouse_down(x=100.0, y=100.0, button=1)
        gesture_handler.handle_mouse_move(x=100.0, y=100.0)

        assert viewport.offset_x == 0.0
        assert viewport.offset_y == 0.0
        mock_canvas.redraw.assert_not_called()

    def test_multi_step_drag_sequence_accumulates_offset_correctly(
        self, gesture_handler: GestureHandler, mock_canvas: MagicMock, viewport: Viewport
    ):
        """Verify incremental mouse moves track relative deltas continuously."""
        gesture_handler.handle_mouse_down(x=50.0, y=50.0, button=1)

        gesture_handler.handle_mouse_move(x=70.0, y=60.0)   # dx = +20, dy = +10
        gesture_handler.handle_mouse_move(x=100.0, y=90.0)  # dx = +30, dy = +30
        gesture_handler.handle_mouse_move(x=80.0, y=40.0)   # dx = -20, dy = -50

        # Total expected: dx = (70-50) + (100-70) + (80-100) = 30.0
        # Total expected: dy = (60-50) + (90-60) + (40-90) = -10.0
        assert viewport.offset_x == pytest.approx(30.0)
        assert viewport.offset_y == pytest.approx(-10.0)
        assert mock_canvas.redraw.call_count == 3

    def test_mouse_up_concludes_pan_and_prevents_positional_drift(
        self, gesture_handler: GestureHandler, mock_canvas: MagicMock, viewport: Viewport
    ):
        """
        Acceptance Criteria 2:
        Given an active canvas pan operation,
        When the mouse drag concludes via mouseup,
        Then the pan state must deactivate and persist final viewport offset without positional drift.
        """
        # Start pan and drag
        gesture_handler.handle_mouse_down(x=100.0, y=100.0, button=1)
        gesture_handler.handle_mouse_move(x=250.0, y=180.0)

        expected_final_x = 150.0
        expected_final_y = 80.0
        assert viewport.offset_x == pytest.approx(expected_final_x)
        assert viewport.offset_y == pytest.approx(expected_final_y)

        # Release mouse
        gesture_handler.handle_mouse_up(x=250.0, y=180.0, button=1)
        assert gesture_handler.is_panning is False

        # Subsequent mouse movement must NOT alter offset (no drift)
        redraw_count_before = mock_canvas.redraw.call_count
        gesture_handler.handle_mouse_move(x=400.0, y=500.0)

        assert viewport.offset_x == pytest.approx(expected_final_x)
        assert viewport.offset_y == pytest.approx(expected_final_y)
        assert mock_canvas.redraw.call_count == redraw_count_before

    def test_mouse_leave_canvas_bounds_concludes_pan_without_drift(
        self, gesture_handler: GestureHandler, mock_canvas: MagicMock, viewport: Viewport
    ):
        """
        Acceptance Criteria 2 (Boundaries):
        Given an active canvas pan operation,
        When the mouse drag leaves canvas bounds,
        Then the pan state must deactivate and persist the final viewport offset without positional drift.
        """
        gesture_handler.handle_mouse_down(x=200.0, y=200.0, button=1)
        gesture_handler.handle_mouse_move(x=350.0, y=275.0)

        expected_final_x = 150.0
        expected_final_y = 75.0
        assert viewport.offset_x == pytest.approx(expected_final_x)
        assert viewport.offset_y == pytest.approx(expected_final_y)

        # Dispatch mouse leave event
        gesture_handler.handle_mouse_leave()

        assert gesture_handler.is_panning is False
        assert viewport.offset_x == pytest.approx(expected_final_x)
        assert viewport.offset_y == pytest.approx(expected_final_y)

        # Move outside bounds must not cause further panning or drift
        gesture_handler.handle_mouse_move(x=950.0, y=700.0)
        assert viewport.offset_x == pytest.approx(expected_final_x)
        assert viewport.offset_y == pytest.approx(expected_final_y)

    def test_mouse_move_exceeding_canvas_bounds_triggers_leave_and_stops_pan(
        self, gesture_handler: GestureHandler, mock_canvas: MagicMock, viewport: Viewport
    ):
        """
        Verify moving the pointer past canvas dimensions automatically deactivates
        pan and keeps the offset clamped/fixed at the boundary point without drifting.
        """
        # Canvas dimensions: 800 x 600
        gesture_handler.handle_mouse_down(x=700.0, y=500.0, button=1)
        gesture_handler.handle_mouse_move(x=780.0, y=550.0)  # dx = +80, dy = +50

        # Pointer exits bounds: x = 850 (> 800)
        gesture_handler.handle_mouse_move(x=850.0, y=650.0)

        assert gesture_handler.is_panning is False
        assert viewport.offset_x == pytest.approx(80.0)
        assert viewport.offset_y == pytest.approx(50.0)

    @pytest.mark.parametrize("invalid_button", [2, 3])
    def test_non_primary_mouse_buttons_do_not_initiate_pan(
        self, gesture_handler: GestureHandler, mock_canvas: MagicMock, viewport: Viewport, invalid_button: int
    ):
        """Verify secondary/tertiary clicks (e.g. right/middle click) do not trigger panning."""
        gesture_handler.handle_mouse_down(x=100.0, y=100.0, button=invalid_button)
        assert gesture_handler.is_panning is False

        gesture_handler.handle_mouse_move(x=150.0, y=150.0)
        assert viewport.offset_x == 0.0
        assert viewport.offset_y == 0.0
        mock_canvas.redraw.assert_not_called()

    def test_negative_coordinate_pan_drag(
        self, gesture_handler: GestureHandler, mock_canvas: MagicMock, viewport: Viewport
    ):
        """Verify panning upwards and to the left (negative deltas) operates accurately."""
        gesture_handler.handle_mouse_down(x=400.0, y=400.0, button=1)
        gesture_handler.handle_mouse_move(x=320.0, y=280.0)  # dx = -80, dy = -120

        assert viewport.offset_x == pytest.approx(-80.0)
        assert viewport.offset_y == pytest.approx(-120.0)

        matrix = viewport.get_matrix()
        assert matrix[0][2] == pytest.approx(-80.0)
        assert matrix[1][2] == pytest.approx(-120.0)
        mock_canvas.redraw.assert_called_once()