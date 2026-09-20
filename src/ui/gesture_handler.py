"""Gesture handling for interactive canvas panning and input events."""

from typing import Optional
from src.ui.canvas import Canvas
from src.ui.viewport import Viewport


class GestureHandler:
    """Translates mouse gestures into viewport pan transformations."""

    def __init__(self, canvas: Canvas, viewport: Viewport) -> None:
        self.canvas = canvas
        self.viewport = viewport
        self.is_panning: bool = False
        self._last_x: Optional[float] = None
        self._last_y: Optional[float] = None

    def handle_mouse_down(self, x: float, y: float, button: int = 1) -> None:
        """Initiate panning on primary mouse button press within canvas bounds."""
        if button != 1:
            return
        if not self.canvas.is_in_bounds(x, y):
            return

        self.is_panning = True
        self._last_x = float(x)
        self._last_y = float(y)

    def handle_mouse_move(self, x: float, y: float) -> None:
        """Apply drag deltas to viewport and request redraw during active pan."""
        if not self.is_panning:
            return

        if not self.canvas.is_in_bounds(x, y):
            self.handle_mouse_leave()
            return

        if self._last_x is None or self._last_y is None:
            self._last_x = float(x)
            self._last_y = float(y)
            return

        dx = float(x) - self._last_x
        dy = float(y) - self._last_y

        if dx == 0.0 and dy == 0.0:
            return

        self._last_x = float(x)
        self._last_y = float(y)

        self.viewport.pan(dx=dx, dy=dy)
        self.canvas.redraw()

    def handle_mouse_up(self, x: float, y: float, button: int = 1) -> None:
        """Deactivate pan when primary mouse button is released."""
        if button == 1:
            self.is_panning = False
            self._last_x = None
            self._last_y = None

    def handle_mouse_leave(self) -> None:
        """Deactivate pan when cursor exits canvas bounds to prevent positional drift."""
        self.is_panning = False
        self._last_x = None
        self._last_y = None