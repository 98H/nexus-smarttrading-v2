"""Stateful Series and ExecutionContext runtime for Pine Script v5 evaluation."""

from __future__ import annotations

import math
from typing import Callable, List, Optional


class Series:
    """Represents a time series in Pine Script v5 with lookback indexing."""

    def __init__(self, name: str = "", values: Optional[List[float]] = None) -> None:
        self.name = name
        self._values: List[float] = list(values) if values is not None else []
        self._subscribers: List[Callable[[float], None]] = []

    def subscribe(self, callback: Callable[[float], None], replay: bool = False) -> None:
        """Subscribes a listener callback to new bar values, optionally replaying history."""
        self._subscribers.append(callback)
        if replay:
            for val in self._values:
                callback(val)

    def append(self, value: float) -> None:
        """Appends a new value to the series and notifies all subscribers."""
        val = float(value) if value is not None else math.nan
        self._values.append(val)
        for subscriber in list(self._subscribers):
            subscriber(val)

    def __len__(self) -> int:
        return len(self._values)

    def __getitem__(self, index: int) -> float:
        """Lookback indexing matching Pine Script v5 conventions: s[0] is current, s[1] is 1 bar ago."""
        if isinstance(index, bool) or not isinstance(index, int):
            raise TypeError(f"Series lookback index must be an integer, got {type(index).__name__}")
        if index < 0:
            raise IndexError(f"Pine Script lookback indices cannot be negative: {index}")
        if index >= len(self._values):
            return math.nan
        return self._values[-1 - index]

    def __repr__(self) -> str:
        return f"Series('{self.name}', len={len(self._values)})"


class ExecutionContext:
    """Manages sequential bar execution state and standard OHLCV series."""

    def __init__(self) -> None:
        self.bar_index: int = -1
        self.open = Series("open")
        self.high = Series("high")
        self.low = Series("low")
        self.close = Series("close")
        self.volume = Series("volume")
        self.time = Series("time")

    def new_bar(
        self,
        open: float,
        high: float,
        low: float,
        close: float,
        volume: float,
        time: Optional[float] = None,
        **kwargs,
    ) -> None:
        """Steps the execution context forward by one bar."""
        self.bar_index += 1
        self.open.append(open)
        self.high.append(high)
        self.low.append(low)
        self.close.append(close)
        self.volume.append(volume)
        self.time.append(time if time is not None else math.nan)