"""
Viewport model managing visible bar ranges and coordinate projections.
"""


class Viewport:
    """Manages the visible candlestick index boundaries and coordinate scaling."""

    def __init__(
        self,
        total_bars: int | float,
        start_index: float,
        end_index: float,
        canvas_width: float = 800.0,
        min_bars: int = 10,
        max_bars: int = 2000,
    ) -> None:
        if canvas_width <= 0.0:
            raise ValueError(f"canvas_width must be positive, got {canvas_width}")
        if min_bars < 1:
            raise ValueError(f"min_bars must be at least 1, got {min_bars}")
        if max_bars < min_bars:
            raise ValueError(
                f"max_bars ({max_bars}) cannot be less than min_bars ({min_bars})"
            )

        visible_count = end_index - start_index
        if visible_count < min_bars:
            raise ValueError(
                f"Initial visible bars ({visible_count}) is less than min_bars ({min_bars})"
            )
        if visible_count > max_bars:
            raise ValueError(
                f"Initial visible bars ({visible_count}) exceeds max_bars ({max_bars})"
            )

        self.total_bars = total_bars
        self.start_index = float(start_index)
        self.end_index = float(end_index)
        self.canvas_width = float(canvas_width)
        self.min_bars = int(min_bars)
        self.max_bars = int(max_bars)

    @property
    def visible_bar_count(self) -> float:
        """Total number of bars currently visible within the viewport."""
        return self.end_index - self.start_index

    def pan(self, delta_pixels: float) -> None:
        """
        Shifts the visible candlestick range by the dragged pixel offset.

        Maintains total visible bar count and strictly clamps boundaries
        between 0 and total_bars in O(1) time.
        """
        if delta_pixels == 0.0:
            return

        count = self.end_index - self.start_index
        shift_bars = delta_pixels * (count / self.canvas_width)
        new_start = self.start_index + shift_bars

        if new_start < 0.0:
            new_start = 0.0
        elif new_start + count > self.total_bars:
            new_start = float(self.total_bars) - count

        self.start_index = new_start
        self.end_index = new_start + count

    def zoom(self, scale_factor: float, cursor_x: float) -> None:
        """
        Zooms the visible candlestick range centered on cursor_x.

        Clamps the resulting visible bar count strictly between min_bars and max_bars.
        Clamps cursor_x within canvas boundaries in O(1) time.
        """
        if scale_factor <= 0.0:
            raise ValueError(f"scale_factor must be positive, got {scale_factor}")

        clamped_cursor_x = max(0.0, min(self.canvas_width, float(cursor_x)))
        cursor_ratio = clamped_cursor_x / self.canvas_width

        initial_count = self.end_index - self.start_index
        bar_under_cursor = self.start_index + cursor_ratio * initial_count

        new_count = initial_count * scale_factor
        if new_count < self.min_bars:
            new_count = float(self.min_bars)
        elif new_count > self.max_bars:
            new_count = float(self.max_bars)

        self.start_index = bar_under_cursor - cursor_ratio * new_count
        self.end_index = bar_under_cursor + (1.0 - cursor_ratio) * new_count