"""Canvas rendering and coordinate boundary management."""

from typing import Optional
from src.ui.viewport import Viewport


class Canvas:
    """Canvas managing viewport linkage, boundary verification, and redraw triggers."""

    def __init__(
        self,
        width: float = 800.0,
        height: float = 600.0,
        viewport: Optional[Viewport] = None,
    ) -> None:
        self.width = float(width)
        self.height = float(height)
        self.viewport = (
            viewport
            if viewport is not None
            else Viewport(width=self.width, height=self.height)
        )

    def is_in_bounds(self, x: float, y: float) -> bool:
        """Check whether the given coordinates lie within canvas boundaries."""
        return 0.0 <= float(x) <= self.width and 0.0 <= float(y) <= self.height

    def redraw(self) -> None:
        """Trigger canvas render pipeline."""
        self.render()

    def render(self) -> None:
        """Execute canvas rendering pass."""
        pass