import inspect
from datetime import datetime
from typing import Awaitable, Callable, Dict, List, Optional

from src.market_structure.models import (
    Bar,
    Pivot,
    PivotType,
    StructureEvent,
    StructureLevel,
    StructureType,
    TrendDirection,
)


class MarketStructureEngine:
    """
    Engine tracking Break of Structure (BOS) and Change of Character (CHoCH)
    independently across swing and internal structure levels.
    """

    def __init__(
        self,
        initial_swing_trend: Optional[TrendDirection] = None,
        initial_internal_trend: Optional[TrendDirection] = None,
        event_listener: Optional[Callable[[StructureEvent], None]] = None,
        async_event_listener: Optional[Callable[[StructureEvent], Awaitable[None]]] = None,
    ) -> None:
        self._event_listener = event_listener
        self._async_event_listener = async_event_listener

        self._trends: Dict[StructureLevel, Optional[TrendDirection]] = {
            StructureLevel.SWING: initial_swing_trend,
            StructureLevel.INTERNAL: initial_internal_trend,
        }
        self._active_pivots: Dict[StructureLevel, Dict[PivotType, Optional[Pivot]]] = {
            StructureLevel.SWING: {PivotType.HIGH: None, PivotType.LOW: None},
            StructureLevel.INTERNAL: {PivotType.HIGH: None, PivotType.LOW: None},
        }
        self._last_pivot_index: Dict[StructureLevel, Optional[int]] = {
            StructureLevel.SWING: None,
            StructureLevel.INTERNAL: None,
        }
        self._last_pivot_timestamp: Dict[StructureLevel, Optional[datetime]] = {
            StructureLevel.SWING: None,
            StructureLevel.INTERNAL: None,
        }
        self._last_bar: Optional[Bar] = None

    def register_pivot(self, pivot: Pivot) -> None:
        """Register a swing or internal pivot, verifying chronological ordering."""
        level = pivot.level
        last_idx = self._last_pivot_index.get(level)
        if last_idx is not None and pivot.index < last_idx:
            raise ValueError(
                f"Pivot index {pivot.index} cannot be lower than previously registered pivot index {last_idx} for level {level}"
            )

        last_ts = self._last_pivot_timestamp.get(level)
        if last_ts is not None and pivot.timestamp < last_ts:
            raise ValueError(
                f"Pivot timestamp {pivot.timestamp} cannot be earlier than previously registered timestamp {last_ts} for level {level}"
            )

        self._last_pivot_index[level] = pivot.index
        self._last_pivot_timestamp[level] = pivot.timestamp
        self._active_pivots[level][pivot.pivot_type] = pivot

    def process_bar(self, bar: Bar) -> List[StructureEvent]:
        """Evaluate a newly closed bar against active structure pivots."""
        if self._last_bar is not None:
            if bar.index < self._last_bar.index:
                raise ValueError(
                    f"Bar index {bar.index} cannot be lower than previous bar index {self._last_bar.index}"
                )
            if bar.timestamp < self._last_bar.timestamp:
                raise ValueError(
                    f"Bar timestamp {bar.timestamp} cannot be earlier than previous bar timestamp {self._last_bar.timestamp}"
                )
        self._last_bar = bar

        events: List[StructureEvent] = []

        # Evaluate internal and swing levels independently
        for level in (StructureLevel.INTERNAL, StructureLevel.SWING):
            trend = self._trends.get(level)
            if trend is None:
                continue

            active_high = self._active_pivots[level][PivotType.HIGH]
            active_low = self._active_pivots[level][PivotType.LOW]

            if trend == TrendDirection.UPTREND:
                if active_high is not None and bar.close > active_high.price:
                    event = StructureEvent(
                        event_type=StructureType.BOS,
                        level=level,
                        direction=TrendDirection.UPTREND,
                        broken_pivot_index=active_high.index,
                        broken_pivot_price=active_high.price,
                        timestamp=bar.timestamp,
                        bar_index=bar.index,
                        trigger_price=bar.close,
                    )
                    events.append(event)
                    self._active_pivots[level][PivotType.HIGH] = None
                elif active_low is not None and bar.close < active_low.price:
                    event = StructureEvent(
                        event_type=StructureType.CHOCH,
                        level=level,
                        direction=TrendDirection.DOWNTREND,
                        broken_pivot_index=active_low.index,
                        broken_pivot_price=active_low.price,
                        timestamp=bar.timestamp,
                        bar_index=bar.index,
                        trigger_price=bar.close,
                    )
                    events.append(event)
                    self._active_pivots[level][PivotType.LOW] = None
                    self._trends[level] = TrendDirection.DOWNTREND

            elif trend == TrendDirection.DOWNTREND:
                if active_low is not None and bar.close < active_low.price:
                    event = StructureEvent(
                        event_type=StructureType.BOS,
                        level=level,
                        direction=TrendDirection.DOWNTREND,
                        broken_pivot_index=active_low.index,
                        broken_pivot_price=active_low.price,
                        timestamp=bar.timestamp,
                        bar_index=bar.index,
                        trigger_price=bar.close,
                    )
                    events.append(event)
                    self._active_pivots[level][PivotType.LOW] = None
                elif active_high is not None and bar.close > active_high.price:
                    event = StructureEvent(
                        event_type=StructureType.CHOCH,
                        level=level,
                        direction=TrendDirection.UPTREND,
                        broken_pivot_index=active_high.index,
                        broken_pivot_price=active_high.price,
                        timestamp=bar.timestamp,
                        bar_index=bar.index,
                        trigger_price=bar.close,
                    )
                    events.append(event)
                    self._active_pivots[level][PivotType.HIGH] = None
                    self._trends[level] = TrendDirection.UPTREND

        if self._event_listener is not None:
            for event in events:
                self._event_listener(event)

        return events

    async def process_bar_async(self, bar: Bar) -> List[StructureEvent]:
        """Asynchronously process a bar and dispatch events to async listener if configured."""
        events = self.process_bar(bar)
        if self._async_event_listener is not None:
            for event in events:
                res = self._async_event_listener(event)
                if inspect.isawaitable(res):
                    await res
        return events

    def get_trend(self, level: StructureLevel) -> Optional[TrendDirection]:
        """Get the current established trend direction for the given structure level."""
        return self._trends.get(level)

    def get_active_pivot(self, level: StructureLevel, pivot_type: PivotType) -> Optional[Pivot]:
        """Get the active (unbroken) pivot for a specified structure level and pivot type."""
        return self._active_pivots.get(level, {}).get(pivot_type)

    def reset(self) -> None:
        """Reset the engine state, clearing all active pivots, trends, and history."""
        self._trends = {
            StructureLevel.SWING: None,
            StructureLevel.INTERNAL: None,
        }
        self._active_pivots = {
            StructureLevel.SWING: {PivotType.HIGH: None, PivotType.LOW: None},
            StructureLevel.INTERNAL: {PivotType.HIGH: None, PivotType.LOW: None},
        }
        self._last_pivot_index = {
            StructureLevel.SWING: None,
            StructureLevel.INTERNAL: None,
        }
        self._last_pivot_timestamp = {
            StructureLevel.SWING: None,
            StructureLevel.INTERNAL: None,
        }
        self._last_bar = None