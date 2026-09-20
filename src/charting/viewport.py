from __future__ import annotations

from src.charting.matrix import Matrix3x3


class Viewport:
    """Manages viewport dimensions, data visible ranges, and projection matrices."""

    def __init__(
        self,
        width: float,
        height: float,
        t_min: float,
        t_max: float,
        p_min: float,
        p_max: float,
    ) -> None:
        self._validate_dimensions(width, height)
        self._validate_bounds(t_min, t_max, p_min, p_max)

        self._width = float(width)
        self._height = float(height)
        self._t_min = float(t_min)
        self._t_max = float(t_max)
        self._p_min = float(p_min)
        self._p_max = float(p_max)

        self._projection_matrix: Matrix3x3
        self._inverse_projection_matrix: Matrix3x3
        self._update_projection_matrix()

    @staticmethod
    def _validate_dimensions(width: float, height: float) -> None:
        if width <= 0.0 or height <= 0.0:
            raise ValueError("Canvas width and height must be strictly positive.")

    @staticmethod
    def _validate_bounds(t_min: float, t_max: float, p_min: float, p_max: float) -> None:
        if t_min >= t_max:
            raise ValueError("t_min must be strictly less than t_max.")
        if p_min >= p_max:
            raise ValueError("p_min must be strictly less than p_max.")

    def _update_projection_matrix(self) -> None:
        delta_t = self._t_max - self._t_min
        delta_p = self._p_max - self._p_min

        sx = self._width / delta_t
        tx = -sx * self._t_min

        sy = -self._height / delta_p
        ty = -sy * self._p_max

        self._projection_matrix = Matrix3x3((
            (sx, 0.0, tx),
            (0.0, sy, ty),
            (0.0, 0.0, 1.0),
        ))
        self._inverse_projection_matrix = self._projection_matrix.inverse()

    @property
    def width(self) -> float:
        return self._width

    @property
    def height(self) -> float:
        return self._height

    @property
    def t_min(self) -> float:
        return self._t_min

    @property
    def t_max(self) -> float:
        return self._t_max

    @property
    def p_min(self) -> float:
        return self._p_min

    @property
    def p_max(self) -> float:
        return self._p_max

    @property
    def projection_matrix(self) -> Matrix3x3:
        return self._projection_matrix

    def set_dimensions(self, width: float, height: float) -> None:
        """Update canvas dimensions and recompute projection matrices."""
        self._validate_dimensions(width, height)
        self._width = float(width)
        self._height = float(height)
        self._update_projection_matrix()

    def set_bounds(self, t_min: float, t_max: float, p_min: float, p_max: float) -> None:
        """Update visible time and price ranges and recompute projection matrices."""
        self._validate_bounds(t_min, t_max, p_min, p_max)
        self._t_min = float(t_min)
        self._t_max = float(t_max)
        self._p_min = float(p_min)
        self._p_max = float(p_max)
        self._update_projection_matrix()

    def world_to_screen(self, timestamp: float, price: float) -> tuple[float, float]:
        """Map world coordinates (timestamp, price) to screen pixel coordinates (x, y)."""
        return self._projection_matrix.transform_point(timestamp, price)

    def screen_to_world(self, x: float, y: float) -> tuple[float, float]:
        """Map screen pixel coordinates (x, y) to world coordinates (timestamp, price)."""
        return self._inverse_projection_matrix.transform_point(x, y)

    def __repr__(self) -> str:
        return (
            f"Viewport(width={self._width}, height={self._height}, "
            f"t_min={self._t_min}, t_max={self._t_max}, "
            f"p_min={self._p_min}, p_max={self._p_max})"
        )