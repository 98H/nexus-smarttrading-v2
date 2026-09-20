"""Viewport state and transformation matrix management."""

from typing import List


class Viewport:
    """Manages viewport dimensions, translation offsets, and zoom scale."""

    def __init__(
        self,
        width: float = 800.0,
        height: float = 600.0,
        offset_x: float = 0.0,
        offset_y: float = 0.0,
        zoom: float = 1.0,
    ) -> None:
        self.width = float(width)
        self.height = float(height)
        self.offset_x = float(offset_x)
        self.offset_y = float(offset_y)
        self.zoom = float(zoom)

    def pan(self, dx: float, dy: float) -> None:
        """Apply relative translation delta to current offset coordinates."""
        self.offset_x += float(dx)
        self.offset_y += float(dy)

    def get_matrix(self) -> List[List[float]]:
        """Return 3x3 affine transformation matrix [[sx, 0, tx], [0, sy, ty], [0, 0, 1]]."""
        return [
            [self.zoom, 0.0, self.offset_x],
            [0.0, self.zoom, self.offset_y],
            [0.0, 0.0, 1.0],
        ]