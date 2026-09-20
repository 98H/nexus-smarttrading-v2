from __future__ import annotations

from typing import Sequence


class Matrix3x3:
    """A 3x3 transformation matrix for 2D affine and projective transformations."""

    def __init__(self, elements: Sequence[Sequence[float]]) -> None:
        try:
            rows = tuple(tuple(float(val) for val in row) for row in elements)
        except (TypeError, ValueError) as exc:
            raise ValueError("Matrix elements must be a 3x3 sequence of numbers.") from exc

        if len(rows) != 3 or any(len(row) != 3 for row in rows):
            raise ValueError("Matrix3x3 requires a 3x3 sequence of elements.")

        self._elements: tuple[tuple[float, float, float], ...] = rows

    @classmethod
    def identity(cls) -> Matrix3x3:
        """Create a 3x3 identity matrix."""
        return cls((
            (1.0, 0.0, 0.0),
            (0.0, 1.0, 0.0),
            (0.0, 0.0, 1.0),
        ))

    @property
    def elements(self) -> tuple[tuple[float, float, float], ...]:
        """Return the matrix elements as a nested tuple."""
        return self._elements

    def transform_point(self, x: float, y: float) -> tuple[float, float]:
        """Transform a 2D point [x, y, 1]^T through this matrix."""
        m = self._elements
        x_out = m[0][0] * x + m[0][1] * y + m[0][2]
        y_out = m[1][0] * x + m[1][1] * y + m[1][2]
        w_out = m[2][0] * x + m[2][1] * y + m[2][2]

        if w_out != 0.0 and w_out != 1.0:
            return x_out / w_out, y_out / w_out
        return x_out, y_out

    def multiply(self, other: Matrix3x3) -> Matrix3x3:
        """Multiply this matrix by another Matrix3x3 (self * other)."""
        a = self._elements
        b = other._elements
        result = tuple(
            tuple(
                sum(a[i][k] * b[k][j] for k in range(3))
                for j in range(3)
            )
            for i in range(3)
        )
        return Matrix3x3(result)

    def inverse(self) -> Matrix3x3:
        """Compute and return the inverse matrix.

        Raises:
            ValueError: If the matrix is singular (determinant is zero).
        """
        m = self._elements
        a, b, c = m[0]
        d, e, f = m[1]
        g, h, i = m[2]

        c00 = e * i - f * h
        c01 = -(d * i - f * g)
        c02 = d * h - e * g

        det = a * c00 + b * c01 + c * c02

        if abs(det) < 1e-12:
            raise ValueError("Matrix is singular and cannot be inverted.")

        c10 = -(b * i - c * h)
        c11 = a * i - c * g
        c12 = -(a * h - b * g)

        c20 = b * f - c * e
        c21 = -(a * f - c * d)
        c22 = a * e - b * d

        inv_elements = (
            (c00 / det, c10 / det, c20 / det),
            (c01 / det, c11 / det, c21 / det),
            (c02 / det, c12 / det, c22 / det),
        )
        return Matrix3x3(inv_elements)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Matrix3x3):
            return NotImplemented
        return self._elements == other._elements

    def __repr__(self) -> str:
        return f"Matrix3x3({self._elements})"