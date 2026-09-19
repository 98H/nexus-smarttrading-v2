"""
Gesture controller handling drag, mouse wheel, and pinch interactions.
"""

import math
import time
from typing import Any, Callable

from src.chart.viewport import Viewport


class GestureController:
    """Translates user input gestures into viewport boundary transformations."""

    def __init__(
        self,
        viewport: Viewport,
        on_viewport_change: Callable[[], None] | None = None,
        throttle_interval: float = 0.016,
    ) -> None:
        self.viewport = viewport
        self.on_viewport_change = on_viewport_change
        self.throttle_interval = throttle_interval
        self._last_notify_time: float = 0.0

    def handle_drag(self, delta_x: float = 0.0, delta_y: float = 0.0) -> None:
        """
        Processes horizontal drag to shift time-axis viewport.

        Ignores vertical deltas for the time axis. Triggers viewport change callback.
        """
        if delta_x == 0.0:
            return

        self.viewport.pan(delta_pixels=delta_x)
        self._emit_telemetry("drag", delta_x=delta_x, delta_y=delta_y)
        self._notify_viewport_change()

    def handle_wheel(self, delta_y: float, cursor_x: float | None = None) -> None:
        """
        Processes mouse wheel zoom centered at cursor_x.

        Positive delta_y indicates zoom in (decreases visible bars).
        Negative delta_y indicates zoom out (increases visible bars).
        """
        if delta_y == 0.0:
            return

        if cursor_x is None:
            cursor_x = self.viewport.canvas_width * 0.5

        scale_factor = math.exp(-delta_y * 0.001)
        self.viewport.zoom(scale_factor=scale_factor, cursor_x=cursor_x)
        self._emit_telemetry("wheel", delta_y=delta_y, cursor_x=cursor_x)
        self._notify_viewport_change()

    def handle_pinch(self, scale_factor: float, center_x: float | None = None) -> None:
        """
        Processes two-finger pinch gesture centered at center_x.

        Scale > 1.0 indicates magnification / zoom in (decreases visible bars).
        Scale < 1.0 indicates demagnification / zoom out (increases visible bars).
        """
        if scale_factor <= 0.0:
            raise ValueError(f"scale_factor must be positive, got {scale_factor}")

        if center_x is None:
            center_x = self.viewport.canvas_width * 0.5

        viewport_scale = 1.0 / scale_factor
        self.viewport.zoom(scale_factor=viewport_scale, cursor_x=center_x)
        self._emit_telemetry("pinch", scale_factor=scale_factor, center_x=center_x)
        self._notify_viewport_change()

    def _notify_viewport_change(self) -> None:
        """Invokes registered callback on viewport update, throttled to prevent blocking frame render cycles."""
        if self.on_viewport_change is None:
            return

        now = time.perf_counter()
        if now - self._last_notify_time >= self.throttle_interval:
            self._last_notify_time = now
            self.on_viewport_change()

    def _emit_telemetry(self, event_type: str, **payload: Any) -> None:
        """Telemetry hook for monitoring gesture throughput and latency."""
        pass