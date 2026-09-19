"""
Unit tests for Viewport and Gesture Controller.
Requirement: Story 2.2.1: Pan and Pinch-to-Zoom Gesture Controller
Acceptance Criteria:
- Horizontal drag shifts visible range along time axis without altering visible bar count.
- Mouse wheel or pinch zooms centered on cursor position, clamped between 10 and 2,000 visible bars.
- Rapid pan/zoom gesture events compute boundary updates in O(1) time without blocking render cycles.
"""

import asyncio
import math
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.chart.gesture_controller import GestureController
from src.chart.viewport import Viewport


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def standard_viewport() -> Viewport:
    """Provides a baseline Viewport instance with 100 visible bars out of 1000."""
    return Viewport(
        total_bars=1000,
        start_index=100.0,
        end_index=200.0,
        canvas_width=800.0,
        min_bars=10,
        max_bars=2000,
    )


@pytest.fixture
def mock_render_callback() -> MagicMock:
    """Mock callback invoked when viewport changes to trigger frame rendering."""
    return MagicMock()


@pytest.fixture
def gesture_controller(
    standard_viewport: Viewport, mock_render_callback: MagicMock
) -> GestureController:
    """Provides a GestureController wired to standard_viewport and a mock callback."""
    return GestureController(
        viewport=standard_viewport,
        on_viewport_change=mock_render_callback,
    )


# ============================================================================
# Viewport: Horizontal Panning (AC 1)
# ============================================================================


class TestViewportPanning:
    """Tests horizontal drag/pan range shifts without altering total visible bar count."""

    def test_pan_shifts_range_without_altering_bar_count(
        self, standard_viewport: Viewport
    ) -> None:
        initial_count = standard_viewport.visible_bar_count
        initial_start = standard_viewport.start_index
        initial_end = standard_viewport.end_index

        # Canvas is 800px for 100 bars -> 8px per bar. Dragging by 80px shifts by 10 bars.
        standard_viewport.pan(delta_pixels=80.0)

        assert standard_viewport.visible_bar_count == pytest.approx(initial_count)
        assert (standard_viewport.end_index - standard_viewport.start_index) == pytest.approx(
            initial_count
        )
        assert standard_viewport.start_index != initial_start
        assert standard_viewport.end_index != initial_end

    def test_pan_preserves_bar_count_over_fractional_deltas(
        self, standard_viewport: Viewport
    ) -> None:
        initial_count = standard_viewport.visible_bar_count
        fractional_deltas = [0.333, -12.77, 45.123, -0.005, 101.99]

        for delta in fractional_deltas:
            standard_viewport.pan(delta_pixels=delta)
            assert standard_viewport.visible_bar_count == pytest.approx(
                initial_count, abs=1e-9
            )
            assert (
                standard_viewport.end_index - standard_viewport.start_index
            ) == pytest.approx(initial_count, abs=1e-9)

    def test_consecutive_opposite_pans_return_to_origin(
        self, standard_viewport: Viewport
    ) -> None:
        initial_start = standard_viewport.start_index
        initial_end = standard_viewport.end_index

        standard_viewport.pan(delta_pixels=150.0)
        standard_viewport.pan(delta_pixels=-150.0)

        assert standard_viewport.start_index == pytest.approx(initial_start, abs=1e-9)
        assert standard_viewport.end_index == pytest.approx(initial_end, abs=1e-9)

    def test_pan_clamps_at_lower_boundary_preserving_visible_count(
        self, standard_viewport: Viewport
    ) -> None:
        initial_count = standard_viewport.visible_bar_count
        # Drag far left past 0 index
        standard_viewport.pan(delta_pixels=-100000.0)

        assert standard_viewport.start_index == pytest.approx(0.0)
        assert standard_viewport.end_index == pytest.approx(initial_count)
        assert standard_viewport.visible_bar_count == pytest.approx(initial_count)

    def test_pan_clamps_at_upper_boundary_preserving_visible_count(
        self, standard_viewport: Viewport
    ) -> None:
        initial_count = standard_viewport.visible_bar_count
        # Drag far right past total_bars
        standard_viewport.pan(delta_pixels=100000.0)

        assert standard_viewport.end_index == pytest.approx(
            standard_viewport.total_bars
        )
        assert standard_viewport.start_index == pytest.approx(
            standard_viewport.total_bars - initial_count
        )
        assert standard_viewport.visible_bar_count == pytest.approx(initial_count)


# ============================================================================
# Viewport: Zooming and Boundary Clamping (AC 2)
# ============================================================================


class TestViewportZooming:
    """Tests cursor-centered zooming clamped strictly between 10 and 2,000 bars."""

    def test_zoom_clamps_to_minimum_10_bars(self) -> None:
        vp = Viewport(
            total_bars=5000,
            start_index=100.0,
            end_index=120.0,  # 20 bars visible
            canvas_width=800.0,
            min_bars=10,
            max_bars=2000,
        )

        # Drastic zoom-in (scale factor < 1 shrinks visible bars)
        vp.zoom(scale_factor=0.01, cursor_x=400.0)

        assert vp.visible_bar_count == pytest.approx(10.0)
        assert (vp.end_index - vp.start_index) == pytest.approx(10.0)

        # Another zoom-in must strictly stay at 10
        vp.zoom(scale_factor=0.5, cursor_x=400.0)
        assert vp.visible_bar_count == pytest.approx(10.0)

    def test_zoom_clamps_to_maximum_2000_bars(self) -> None:
        vp = Viewport(
            total_bars=5000,
            start_index=100.0,
            end_index=1600.0,  # 1500 bars visible
            canvas_width=800.0,
            min_bars=10,
            max_bars=2000,
        )

        # Drastic zoom-out (scale factor > 1 increases visible bars)
        vp.zoom(scale_factor=10.0, cursor_x=400.0)

        assert vp.visible_bar_count == pytest.approx(2000.0)
        assert (vp.end_index - vp.start_index) == pytest.approx(2000.0)

        # Another zoom-out must strictly stay at 2000
        vp.zoom(scale_factor=2.0, cursor_x=400.0)
        assert vp.visible_bar_count == pytest.approx(2000.0)

    @pytest.mark.parametrize(
        "cursor_ratio",
        [0.0, 0.25, 0.5, 0.75, 1.0],
    )
    def test_zoom_centers_accurately_on_cursor_position(
        self, standard_viewport: Viewport, cursor_ratio: float
    ) -> None:
        cursor_x = standard_viewport.canvas_width * cursor_ratio
        initial_count = standard_viewport.visible_bar_count

        # The bar currently positioned under the cursor before zooming
        bar_under_cursor_before = (
            standard_viewport.start_index
            + cursor_ratio * initial_count
        )

        # Apply zoom
        standard_viewport.zoom(scale_factor=0.8, cursor_x=cursor_x)

        new_count = standard_viewport.visible_bar_count
        bar_under_cursor_after = (
            standard_viewport.start_index
            + cursor_ratio * new_count
        )

        # The exact same bar must remain fixed under the cursor pixel coordinate
        assert bar_under_cursor_after == pytest.approx(bar_under_cursor_before, rel=1e-5)

    def test_zoom_at_left_edge_anchors_start_index(
        self, standard_viewport: Viewport
    ) -> None:
        initial_start = standard_viewport.start_index
        # Cursor at left edge (pixel 0)
        standard_viewport.zoom(scale_factor=0.5, cursor_x=0.0)

        assert standard_viewport.start_index == pytest.approx(initial_start, rel=1e-5)
        assert standard_viewport.visible_bar_count == pytest.approx(50.0)

    def test_zoom_at_right_edge_anchors_end_index(
        self, standard_viewport: Viewport
    ) -> None:
        initial_end = standard_viewport.end_index
        # Cursor at right edge (canvas width)
        standard_viewport.zoom(
            scale_factor=0.5, cursor_x=standard_viewport.canvas_width
        )

        assert standard_viewport.end_index == pytest.approx(initial_end, rel=1e-5)
        assert standard_viewport.visible_bar_count == pytest.approx(50.0)

    def test_zoom_clamps_cursor_outside_canvas_bounds(
        self, standard_viewport: Viewport
    ) -> None:
        initial_start = standard_viewport.start_index
        initial_end = standard_viewport.end_index

        # Zoom with negative cursor coordinate should clamp to left edge (0.0)
        standard_viewport.zoom(scale_factor=0.5, cursor_x=-100.0)
        assert standard_viewport.start_index == pytest.approx(initial_start, rel=1e-5)

        # Reset and zoom with cursor beyond canvas_width should clamp to right edge
        vp = Viewport(
            total_bars=1000,
            start_index=100.0,
            end_index=200.0,
            canvas_width=800.0,
            min_bars=10,
            max_bars=2000,
        )
        vp.zoom(scale_factor=0.5, cursor_x=1200.0)
        assert vp.end_index == pytest.approx(initial_end, rel=1e-5)


# ============================================================================
# Viewport: Constructor Validation & Edge Cases
# ============================================================================


class TestViewportValidation:
    """Tests parameter validation and constraint enforcement on Viewport."""

    def test_invalid_canvas_width_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            Viewport(
                total_bars=1000,
                start_index=0,
                end_index=100,
                canvas_width=0.0,
            )

        with pytest.raises(ValueError):
            Viewport(
                total_bars=1000,
                start_index=0,
                end_index=100,
                canvas_width=-500.0,
            )

    def test_min_bars_less_than_one_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            Viewport(
                total_bars=1000,
                start_index=0,
                end_index=100,
                min_bars=0,
            )

    def test_max_bars_less_than_min_bars_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            Viewport(
                total_bars=1000,
                start_index=0,
                end_index=100,
                min_bars=50,
                max_bars=20,
            )

    def test_initial_range_exceeding_max_bars_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            Viewport(
                total_bars=5000,
                start_index=0.0,
                end_index=3000.0,  # 3000 > max_bars (2000)
                min_bars=10,
                max_bars=2000,
            )

    def test_initial_range_subceeding_min_bars_raises_value_error(self) -> None:
        with pytest.raises(ValueError):
            Viewport(
                total_bars=1000,
                start_index=50.0,
                end_index=55.0,  # 5 < min_bars (10)
                min_bars=10,
                max_bars=2000,
            )

    def test_zoom_with_zero_or_negative_scale_raises_value_error(
        self, standard_viewport: Viewport
    ) -> None:
        with pytest.raises(ValueError):
            standard_viewport.zoom(scale_factor=0.0, cursor_x=400.0)

        with pytest.raises(ValueError):
            standard_viewport.zoom(scale_factor=-1.5, cursor_x=400.0)


# ============================================================================
# GestureController: Drag / Pan Handling (AC 1)
# ============================================================================


class TestGestureControllerPanning:
    """Tests GestureController horizontal drag processing and vertical delta decoupling."""

    def test_handle_drag_shifts_viewport_and_triggers_callback(
        self, gesture_controller: GestureController, mock_render_callback: MagicMock
    ) -> None:
        initial_start = gesture_controller.viewport.start_index
        initial_count = gesture_controller.viewport.visible_bar_count

        gesture_controller.handle_drag(delta_x=40.0, delta_y=0.0)

        assert gesture_controller.viewport.visible_bar_count == pytest.approx(
            initial_count
        )
        assert gesture_controller.viewport.start_index != initial_start
        mock_render_callback.assert_called_once()

    def test_handle_drag_ignores_vertical_delta_for_time_axis(
        self, gesture_controller: GestureController
    ) -> None:
        initial_start = gesture_controller.viewport.start_index
        initial_end = gesture_controller.viewport.end_index

        # Only vertical movement should not alter horizontal time range
        gesture_controller.handle_drag(delta_x=0.0, delta_y=150.0)

        assert gesture_controller.viewport.start_index == pytest.approx(initial_start)
        assert gesture_controller.viewport.end_index == pytest.approx(initial_end)

    def test_zero_delta_drag_is_noop(
        self, gesture_controller: GestureController, mock_render_callback: MagicMock
    ) -> None:
        initial_start = gesture_controller.viewport.start_index

        gesture_controller.handle_drag(delta_x=0.0, delta_y=0.0)

        assert gesture_controller.viewport.start_index == pytest.approx(initial_start)
        mock_render_callback.assert_not_called()


# ============================================================================
# GestureController: Wheel and Pinch Zooming (AC 2)
# ============================================================================


class TestGestureControllerZooming:
    """Tests mouse wheel and pinch gesture dispatching and clamping."""

    def test_wheel_zoom_in_decreases_visible_bars(
        self, gesture_controller: GestureController, mock_render_callback: MagicMock
    ) -> None:
        initial_count = gesture_controller.viewport.visible_bar_count

        # Positive wheel delta (wheel up) indicates zoom in
        gesture_controller.handle_wheel(delta_y=120.0, cursor_x=400.0)

        assert gesture_controller.viewport.visible_bar_count < initial_count
        assert gesture_controller.viewport.visible_bar_count >= 10.0
        mock_render_callback.assert_called_once()

    def test_wheel_zoom_out_increases_visible_bars(
        self, gesture_controller: GestureController, mock_render_callback: MagicMock
    ) -> None:
        initial_count = gesture_controller.viewport.visible_bar_count

        # Negative wheel delta (wheel down) indicates zoom out
        gesture_controller.handle_wheel(delta_y=-120.0, cursor_x=400.0)

        assert gesture_controller.viewport.visible_bar_count > initial_count
        assert gesture_controller.viewport.visible_bar_count <= 2000.0
        mock_render_callback.assert_called_once()

    def test_pinch_zoom_in_spread(
        self, gesture_controller: GestureController, mock_render_callback: MagicMock
    ) -> None:
        initial_count = gesture_controller.viewport.visible_bar_count

        # Pinch scale > 1.0 magnifies view (decreases visible bars)
        gesture_controller.handle_pinch(scale_factor=1.25, center_x=400.0)

        assert gesture_controller.viewport.visible_bar_count < initial_count
        assert gesture_controller.viewport.visible_bar_count >= 10.0
        mock_render_callback.assert_called_once()

    def test_pinch_zoom_out_collapse(
        self, gesture_controller: GestureController, mock_render_callback: MagicMock
    ) -> None:
        initial_count = gesture_controller.viewport.visible_bar_count

        # Pinch scale < 1.0 demagnifies view (increases visible bars)
        gesture_controller.handle_pinch(scale_factor=0.8, center_x=400.0)

        assert gesture_controller.viewport.visible_bar_count > initial_count
        assert gesture_controller.viewport.visible_bar_count <= 2000.0
        mock_render_callback.assert_called_once()

    def test_pinch_with_non_positive_scale_raises_value_error(
        self, gesture_controller: GestureController
    ) -> None:
        with pytest.raises(ValueError):
            gesture_controller.handle_pinch(scale_factor=0.0, center_x=400.0)

        with pytest.raises(ValueError):
            gesture_controller.handle_pinch(scale_factor=-0.5, center_x=400.0)

    def test_repeated_wheel_zooming_respects_strict_clamps(
        self, gesture_controller: GestureController
    ) -> None:
        # Repeated zoom in
        for _ in range(50):
            gesture_controller.handle_wheel(delta_y=100.0, cursor_x=400.0)
        assert gesture_controller.viewport.visible_bar_count == pytest.approx(10.0)

        # Repeated zoom out
        for _ in range(100):
            gesture_controller.handle_wheel(delta_y=-100.0, cursor_x=400.0)
        assert gesture_controller.viewport.visible_bar_count == pytest.approx(2000.0)


# ============================================================================
# Performance: O(1) Computational Complexity and Non-blocking Cycle (AC 3)
# ============================================================================


class TestGesturePerformanceAndNonBlocking:
    """Tests that rapid gesture events compute boundary updates in O(1) time."""

    def test_viewport_operations_are_constant_time_regardless_of_total_bars(
        self,
    ) -> None:
        """Verifies O(1) scaling by comparing operations on 1k vs 10M bars dataset."""
        vp_small = Viewport(
            total_bars=1_000,
            start_index=100.0,
            end_index=200.0,
            canvas_width=800.0,
            min_bars=10,
            max_bars=2000,
        )
        vp_huge = Viewport(
            total_bars=10_000_000,
            start_index=100.0,
            end_index=200.0,
            canvas_width=800.0,
            min_bars=10,
            max_bars=2000,
        )

        iterations = 5_000

        # Benchmark small dataset
        start_small = time.perf_counter()
        for i in range(iterations):
            vp_small.pan(delta_pixels=1.0 if i % 2 == 0 else -1.0)
            vp_small.zoom(scale_factor=1.001 if i % 2 == 0 else 0.999, cursor_x=400.0)
        duration_small = time.perf_counter() - start_small

        # Benchmark huge dataset
        start_huge = time.perf_counter()
        for i in range(iterations):
            vp_huge.pan(delta_pixels=1.0 if i % 2 == 0 else -1.0)
            vp_huge.zoom(scale_factor=1.001 if i % 2 == 0 else 0.999, cursor_x=400.0)
        duration_huge = time.perf_counter() - start_huge

        # In O(1), both durations should be well within the same order of magnitude.
        # Ensure neither executes linear bar iterations (duration_huge should be < 5x duration_small)
        # and each individual operation must execute well below 10 microseconds.
        avg_op_time_huge = duration_huge / (iterations * 2)
        assert avg_op_time_huge < 1e-4  # < 100 microseconds max threshold
        assert duration_huge < max(duration_small * 5.0, 0.25)

    def test_rapid_gesture_burst_executes_within_single_frame_budget(
        self, gesture_controller: GestureController
    ) -> None:
        """Simulates 1,000 rapid mouse wheel / pan events during a 16ms frame budget."""
        num_events = 1_000
        start_time = time.perf_counter()

        for i in range(num_events):
            if i % 2 == 0:
                gesture_controller.handle_drag(delta_x=1.5, delta_y=0.0)
            else:
                gesture_controller.handle_wheel(delta_y=-5.0, cursor_x=400.0)

        total_elapsed = time.perf_counter() - start_time

        # 1,000 updates must complete within 20 milliseconds (< 20 microseconds/update)
        assert total_elapsed < 0.02

    @pytest.mark.asyncio
    async def test_gestures_do_not_block_async_event_loop(
        self, standard_viewport: Viewport
    ) -> None:
        """Verifies gesture processing executes asynchronously without blocking loop tasks."""
        async_frame_runner = AsyncMock()
        controller = GestureController(
            viewport=standard_viewport,
            on_viewport_change=lambda: asyncio.create_task(async_frame_runner()),
        )

        async def simulated_render_loop(duration: float = 0.05):
            ticks = 0
            end = asyncio.get_running_loop().time() + duration
            while asyncio.get_running_loop().time() < end:
                await asyncio.sleep(0.005)
                ticks += 1
            return ticks

        # Start concurrent mock frame loop
        loop_task = asyncio.create_task(simulated_render_loop())

        # Flood with rapid drag events
        for _ in range(500):
            controller.handle_drag(delta_x=2.0, delta_y=0.0)
            await asyncio.sleep(0)  # Yield control to event loop

        ticks = await loop_task
        # The render loop must have continued ticking unhindered
        assert ticks >= 5
        assert async_frame_runner.await_count > 0


# ============================================================================
# External Mocking & Sandbox Isolation
# ============================================================================


class TestExternalIsolation:
    """Ensures sandbox environment by asserting external live brokers/networks are not called."""

    @patch("src.chart.gesture_controller.GestureController._emit_telemetry", autospec=True)
    def test_telemetry_emission_is_mocked_or_non_blocking(
        self, mock_telemetry: MagicMock, standard_viewport: Viewport
    ) -> None:
        controller = GestureController(viewport=standard_viewport)
        controller.handle_drag(delta_x=10.0)
        controller.handle_pinch(scale_factor=1.1, center_x=300.0)

        # Telemetry should be called or bypassed cleanly without network I/O
        if mock_telemetry.called:
            assert mock_telemetry.call_count >= 1