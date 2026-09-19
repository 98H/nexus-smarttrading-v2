"""
Unit tests for Internal & Swing Market Structure Engine (BOS & CHoCH).

Story 3.2.1: Internal & Swing Market Structure Engine (BOS & CHoCH)
Acceptance Criteria:
1. Break of Structure (BOS):
   Given a series of swing high and swing low pivots with an established trend direction,
   When price closes beyond the preceding swing high (in an uptrend) or swing low (in a downtrend),
   Then a BOS event is emitted containing the broken pivot index, event timestamp, and trend direction.
2. Change of Character (CHoCH):
   Given an established trend with prior swing extremes,
   When price closes beyond the opposing swing low (in an uptrend) or swing high (in a downtrend),
   Then a CHoCH event is emitted signaling structure reversal with reference to the broken pivot index.
3. Dual Classification (Internal vs. Swing):
   Given a dual classification of internal and swing pivots,
   When processing bar updates,
   Then both internal and swing structure events are tracked independently without
   cross-contaminating pivot reference indices.
"""

from datetime import datetime, timedelta, timezone
from typing import Callable, List, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.market_structure.models import (
    Bar,
    Pivot,
    PivotType,
    StructureEvent,
    StructureLevel,
    StructureType,
    TrendDirection,
)
from src.market_structure.structure_engine import MarketStructureEngine


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def base_time() -> datetime:
    """Base UTC timestamp for deterministic test time series."""
    return datetime(2023, 10, 1, 0, 0, 0, tzinfo=timezone.utc)


@pytest.fixture
def make_bar(base_time: datetime) -> Callable[..., Bar]:
    """Factory fixture for creating standard Bar objects."""
    def _create(
        index: int,
        open_: float,
        high: float,
        low: float,
        close: float,
        volume: float = 1000.0,
        time_offset_minutes: int = 0,
    ) -> Bar:
        return Bar(
            index=index,
            timestamp=base_time + timedelta(minutes=time_offset_minutes if time_offset_minutes else index),
            open=open_,
            high=high,
            low=low,
            close=close,
            volume=volume,
        )
    return _create


@pytest.fixture
def make_pivot(base_time: datetime) -> Callable[..., Pivot]:
    """Factory fixture for creating Pivot objects."""
    def _create(
        index: int,
        price: float,
        pivot_type: PivotType,
        level: StructureLevel = StructureLevel.SWING,
        time_offset_minutes: int = 0,
    ) -> Pivot:
        return Pivot(
            index=index,
            price=price,
            timestamp=base_time + timedelta(minutes=time_offset_minutes if time_offset_minutes else index),
            pivot_type=pivot_type,
            level=level,
        )
    return _create


# ---------------------------------------------------------------------------
# Test Group 1: Domain Model Validations
# ---------------------------------------------------------------------------

class TestDomainModels:
    """Validate invariants on domain model structures."""

    def test_bar_valid_instantiation(self, base_time: datetime) -> None:
        bar = Bar(
            index=0,
            timestamp=base_time,
            open=100.0,
            high=105.0,
            low=99.0,
            close=103.0,
            volume=500.0,
        )
        assert bar.index == 0
        assert bar.high >= bar.open
        assert bar.high >= bar.close
        assert bar.low <= bar.open
        assert bar.low <= bar.close

    @pytest.mark.parametrize(
        "open_, high, low, close",
        [
            (100.0, 95.0, 90.0, 92.0),   # high < open
            (100.0, 105.0, 106.0, 102.0), # low > open
            (100.0, 105.0, 95.0, 110.0),  # close > high
            (100.0, 105.0, 95.0, 90.0),   # close < low
            (100.0, 90.0, 105.0, 95.0),   # high < low
        ],
    )
    def test_bar_invalid_ohlc_raises_value_error(
        self, base_time: datetime, open_: float, high: float, low: float, close: float
    ) -> None:
        with pytest.raises(ValueError):
            Bar(
                index=1,
                timestamp=base_time,
                open=open_,
                high=high,
                low=low,
                close=close,
                volume=10.0,
            )

    def test_bar_negative_index_raises_value_error(self, base_time: datetime) -> None:
        with pytest.raises(ValueError):
            Bar(
                index=-1,
                timestamp=base_time,
                open=100.0,
                high=105.0,
                low=95.0,
                close=100.0,
                volume=10.0,
            )

    def test_pivot_negative_price_or_index_raises_value_error(self, base_time: datetime) -> None:
        with pytest.raises(ValueError):
            Pivot(
                index=-1,
                price=100.0,
                timestamp=base_time,
                pivot_type=PivotType.HIGH,
                level=StructureLevel.SWING,
            )
        with pytest.raises(ValueError):
            Pivot(
                index=1,
                price=-10.0,
                timestamp=base_time,
                pivot_type=PivotType.HIGH,
                level=StructureLevel.SWING,
            )


# ---------------------------------------------------------------------------
# Test Group 2: Break of Structure (BOS) Engine Tests
# ---------------------------------------------------------------------------

class TestBreakOfStructure:
    """
    AC 1: Given a series of swing high and swing low pivots with an established trend direction,
    When price closes beyond the preceding swing high (in an uptrend) or swing low (in a downtrend),
    Then a Break of Structure (BOS) event is emitted containing broken pivot index, timestamp, trend.
    """

    def test_bullish_bos_emitted_when_bar_closes_above_preceding_swing_high(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        engine = MarketStructureEngine(initial_swing_trend=TrendDirection.UPTREND)

        # Established pivots in Uptrend
        p_low = make_pivot(index=5, price=100.0, pivot_type=PivotType.LOW, level=StructureLevel.SWING)
        p_high = make_pivot(index=10, price=110.0, pivot_type=PivotType.HIGH, level=StructureLevel.SWING)
        engine.register_pivot(p_low)
        engine.register_pivot(p_high)

        # Bar 11: Closes beyond preceding swing high (110.0)
        break_bar = make_bar(index=11, open_=109.0, high=113.0, low=108.5, close=112.0)
        events = engine.process_bar(break_bar)

        assert len(events) == 1
        event = events[0]
        assert event.event_type == StructureType.BOS
        assert event.level == StructureLevel.SWING
        assert event.direction == TrendDirection.UPTREND
        assert event.broken_pivot_index == 10
        assert event.broken_pivot_price == 110.0
        assert event.timestamp == break_bar.timestamp
        assert event.bar_index == 11
        assert event.trigger_price == 112.0

    def test_bearish_bos_emitted_when_bar_closes_below_preceding_swing_low(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        engine = MarketStructureEngine(initial_swing_trend=TrendDirection.DOWNTREND)

        # Established pivots in Downtrend
        p_high = make_pivot(index=5, price=200.0, pivot_type=PivotType.HIGH, level=StructureLevel.SWING)
        p_low = make_pivot(index=10, price=180.0, pivot_type=PivotType.LOW, level=StructureLevel.SWING)
        engine.register_pivot(p_high)
        engine.register_pivot(p_low)

        # Bar 11: Closes beyond preceding swing low (180.0)
        break_bar = make_bar(index=11, open_=182.0, high=183.0, low=175.0, close=177.0)
        events = engine.process_bar(break_bar)

        assert len(events) == 1
        event = events[0]
        assert event.event_type == StructureType.BOS
        assert event.level == StructureLevel.SWING
        assert event.direction == TrendDirection.DOWNTREND
        assert event.broken_pivot_index == 10
        assert event.broken_pivot_price == 180.0
        assert event.timestamp == break_bar.timestamp
        assert event.bar_index == 11
        assert event.trigger_price == 177.0

    def test_wick_beyond_swing_high_without_close_does_not_emit_bos(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        engine = MarketStructureEngine(initial_swing_trend=TrendDirection.UPTREND)
        p_high = make_pivot(index=10, price=110.0, pivot_type=PivotType.HIGH, level=StructureLevel.SWING)
        engine.register_pivot(p_high)

        # High wicks to 112.0, but close is 109.5 (below 110.0)
        wick_bar = make_bar(index=11, open_=108.0, high=112.0, low=107.0, close=109.5)
        events = engine.process_bar(wick_bar)

        assert events == []

    def test_wick_beyond_swing_low_without_close_does_not_emit_bos(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        engine = MarketStructureEngine(initial_swing_trend=TrendDirection.DOWNTREND)
        p_low = make_pivot(index=10, price=180.0, pivot_type=PivotType.LOW, level=StructureLevel.SWING)
        engine.register_pivot(p_low)

        # Low wicks to 175.0, but close is 180.5 (above 180.0)
        wick_bar = make_bar(index=11, open_=182.0, high=183.0, low=175.0, close=180.5)
        events = engine.process_bar(wick_bar)

        assert events == []

    def test_exact_price_touch_equality_does_not_emit_bos(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        engine = MarketStructureEngine(initial_swing_trend=TrendDirection.UPTREND)
        p_high = make_pivot(index=10, price=110.0, pivot_type=PivotType.HIGH, level=StructureLevel.SWING)
        engine.register_pivot(p_high)

        # Close exactly on the pivot price
        touch_bar = make_bar(index=11, open_=108.0, high=110.0, low=108.0, close=110.0)
        events = engine.process_bar(touch_bar)

        assert events == []

    def test_already_broken_pivot_does_not_trigger_duplicate_bos(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        engine = MarketStructureEngine(initial_swing_trend=TrendDirection.UPTREND)
        p_high = make_pivot(index=10, price=110.0, pivot_type=PivotType.HIGH, level=StructureLevel.SWING)
        engine.register_pivot(p_high)

        bar_1 = make_bar(index=11, open_=109.0, high=112.0, low=108.0, close=111.0)
        events_1 = engine.process_bar(bar_1)
        assert len(events_1) == 1
        assert events_1[0].event_type == StructureType.BOS

        # Next bar continues higher; original pivot 10 should not emit another BOS
        bar_2 = make_bar(index=12, open_=111.0, high=115.0, low=110.5, close=114.0)
        events_2 = engine.process_bar(bar_2)
        assert events_2 == []


# ---------------------------------------------------------------------------
# Test Group 3: Change of Character (CHoCH) Engine Tests
# ---------------------------------------------------------------------------

class TestChangeOfCharacter:
    """
    AC 2: Given an established trend with prior swing extremes,
    When price closes beyond the opposing swing low (in an uptrend) or swing high (in a downtrend),
    Then a CHoCH event is emitted signaling structure reversal with reference to broken pivot index.
    """

    def test_bearish_choch_emitted_in_uptrend_when_opposing_low_broken(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        engine = MarketStructureEngine(initial_swing_trend=TrendDirection.UPTREND)

        p_low = make_pivot(index=5, price=100.0, pivot_type=PivotType.LOW, level=StructureLevel.SWING)
        p_high = make_pivot(index=10, price=120.0, pivot_type=PivotType.HIGH, level=StructureLevel.SWING)
        engine.register_pivot(p_low)
        engine.register_pivot(p_high)

        assert engine.get_trend(StructureLevel.SWING) == TrendDirection.UPTREND

        # Price violently drops and closes below opposing swing low (100.0)
        reversal_bar = make_bar(index=15, open_=105.0, high=106.0, low=95.0, close=98.0)
        events = engine.process_bar(reversal_bar)

        assert len(events) == 1
        event = events[0]
        assert event.event_type == StructureType.CHOCH
        assert event.level == StructureLevel.SWING
        assert event.broken_pivot_index == 5
        assert event.broken_pivot_price == 100.0
        assert event.direction == TrendDirection.DOWNTREND
        assert event.timestamp == reversal_bar.timestamp
        assert event.bar_index == 15
        assert event.trigger_price == 98.0

        # State must update trend to DOWNTREND
        assert engine.get_trend(StructureLevel.SWING) == TrendDirection.DOWNTREND

    def test_bullish_choch_emitted_in_downtrend_when_opposing_high_broken(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        engine = MarketStructureEngine(initial_swing_trend=TrendDirection.DOWNTREND)

        p_high = make_pivot(index=5, price=150.0, pivot_type=PivotType.HIGH, level=StructureLevel.SWING)
        p_low = make_pivot(index=10, price=130.0, pivot_type=PivotType.LOW, level=StructureLevel.SWING)
        engine.register_pivot(p_high)
        engine.register_pivot(p_low)

        assert engine.get_trend(StructureLevel.SWING) == TrendDirection.DOWNTREND

        # Price rallies and closes above opposing swing high (150.0)
        reversal_bar = make_bar(index=15, open_=145.0, high=155.0, low=144.0, close=152.0)
        events = engine.process_bar(reversal_bar)

        assert len(events) == 1
        event = events[0]
        assert event.event_type == StructureType.CHOCH
        assert event.level == StructureLevel.SWING
        assert event.broken_pivot_index == 5
        assert event.broken_pivot_price == 150.0
        assert event.direction == TrendDirection.UPTREND
        assert event.timestamp == reversal_bar.timestamp

        # State must update trend to UPTREND
        assert engine.get_trend(StructureLevel.SWING) == TrendDirection.UPTREND

    def test_choch_not_emitted_on_wick_penetration(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        engine = MarketStructureEngine(initial_swing_trend=TrendDirection.UPTREND)
        p_low = make_pivot(index=5, price=100.0, pivot_type=PivotType.LOW, level=StructureLevel.SWING)
        engine.register_pivot(p_low)

        # Low penetrates to 98.0, but close bounces back above to 101.0
        wick_bar = make_bar(index=8, open_=104.0, high=105.0, low=98.0, close=101.0)
        events = engine.process_bar(wick_bar)

        assert events == []
        assert engine.get_trend(StructureLevel.SWING) == TrendDirection.UPTREND

    def test_continuation_after_choch_becomes_bos_in_new_trend_direction(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        """
        Sequence:
        1. Uptrend established.
        2. CHoCH flips trend to Downtrend by breaking swing low.
        3. New swing low established in Downtrend.
        4. Bar closes below new swing low -> triggers BOS (DOWNTREND).
        """
        engine = MarketStructureEngine(initial_swing_trend=TrendDirection.UPTREND)

        p1_low = make_pivot(index=5, price=100.0, pivot_type=PivotType.LOW, level=StructureLevel.SWING)
        p1_high = make_pivot(index=10, price=120.0, pivot_type=PivotType.HIGH, level=StructureLevel.SWING)
        engine.register_pivot(p1_low)
        engine.register_pivot(p1_high)

        # Step 2: CHoCH
        bar_choch = make_bar(index=15, open_=105.0, high=105.0, low=95.0, close=96.0)
        choch_events = engine.process_bar(bar_choch)
        assert len(choch_events) == 1
        assert choch_events[0].event_type == StructureType.CHOCH
        assert engine.get_trend(StructureLevel.SWING) == TrendDirection.DOWNTREND

        # Step 3: Register a new swing low in the downtrend
        p2_low = make_pivot(index=20, price=90.0, pivot_type=PivotType.LOW, level=StructureLevel.SWING)
        engine.register_pivot(p2_low)

        # Step 4: Break new swing low -> should emit BOS in DOWNTREND
        bar_bos = make_bar(index=25, open_=91.0, high=92.0, low=85.0, close=88.0)
        bos_events = engine.process_bar(bar_bos)

        assert len(bos_events) == 1
        assert bos_events[0].event_type == StructureType.BOS
        assert bos_events[0].direction == TrendDirection.DOWNTREND
        assert bos_events[0].broken_pivot_index == 20
        assert bos_events[0].broken_pivot_price == 90.0


# ---------------------------------------------------------------------------
# Test Group 4: Dual Classification (Internal vs. Swing) Isolation Tests
# ---------------------------------------------------------------------------

class TestDualClassificationIndependence:
    """
    AC 3: Given a dual classification of internal and swing pivots,
    When processing bar updates,
    Then both internal and swing structure events are tracked independently
    without cross-contaminating pivot reference indices.
    """

    def test_internal_bos_does_not_affect_swing_pivot_references_or_trend(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        engine = MarketStructureEngine(
            initial_swing_trend=TrendDirection.UPTREND,
            initial_internal_trend=TrendDirection.UPTREND,
        )

        # Swing pivots
        swing_low = make_pivot(index=1, price=90.0, pivot_type=PivotType.LOW, level=StructureLevel.SWING)
        swing_high = make_pivot(index=5, price=150.0, pivot_type=PivotType.HIGH, level=StructureLevel.SWING)
        engine.register_pivot(swing_low)
        engine.register_pivot(swing_high)

        # Internal pivots within the swing range
        int_low = make_pivot(index=7, price=100.0, pivot_type=PivotType.LOW, level=StructureLevel.INTERNAL)
        int_high = make_pivot(index=10, price=110.0, pivot_type=PivotType.HIGH, level=StructureLevel.INTERNAL)
        engine.register_pivot(int_low)
        engine.register_pivot(int_high)

        # Bar breaks internal high (110.0), but well below swing high (150.0)
        bar = make_bar(index=12, open_=109.0, high=115.0, low=108.0, close=112.0)
        events = engine.process_bar(bar)

        assert len(events) == 1
        event = events[0]
        assert event.level == StructureLevel.INTERNAL
        assert event.event_type == StructureType.BOS
        assert event.broken_pivot_index == 10
        assert event.broken_pivot_price == 110.0

        # Swing high at index 5 must remain intact and unbroken
        active_swing_high = engine.get_active_pivot(StructureLevel.SWING, PivotType.HIGH)
        assert active_swing_high is not None
        assert active_swing_high.index == 5
        assert active_swing_high.price == 150.0

    def test_internal_choch_reverses_internal_trend_while_swing_trend_remains_unchanged(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        engine = MarketStructureEngine(
            initial_swing_trend=TrendDirection.UPTREND,
            initial_internal_trend=TrendDirection.UPTREND,
        )

        # Swing Range: [90.0, 150.0]
        engine.register_pivot(make_pivot(1, 90.0, PivotType.LOW, StructureLevel.SWING))
        engine.register_pivot(make_pivot(5, 150.0, PivotType.HIGH, StructureLevel.SWING))

        # Internal Range: [105.0, 120.0]
        engine.register_pivot(make_pivot(7, 105.0, PivotType.LOW, StructureLevel.INTERNAL))
        engine.register_pivot(make_pivot(10, 120.0, PivotType.HIGH, StructureLevel.INTERNAL))

        # Bar drops below internal low (105.0) to 102.0, but still above swing low (90.0)
        bar = make_bar(index=12, open_=108.0, high=109.0, low=100.0, close=102.0)
        events = engine.process_bar(bar)

        assert len(events) == 1
        event = events[0]
        assert event.level == StructureLevel.INTERNAL
        assert event.event_type == StructureType.CHOCH
        assert event.broken_pivot_index == 7
        assert event.broken_pivot_price == 105.0
        assert event.direction == TrendDirection.DOWNTREND

        # Key requirement: Trends and indices tracked independently
        assert engine.get_trend(StructureLevel.INTERNAL) == TrendDirection.DOWNTREND
        assert engine.get_trend(StructureLevel.SWING) == TrendDirection.UPTREND

    def test_simultaneous_internal_and_swing_break_emits_distinct_uncontaminated_events(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        """
        A large explosive bar breaks both the internal high and the outer swing high simultaneously.
        Engine must emit 2 independent events referencing their own respective pivot indices.
        """
        engine = MarketStructureEngine(
            initial_swing_trend=TrendDirection.UPTREND,
            initial_internal_trend=TrendDirection.UPTREND,
        )

        swing_high = make_pivot(index=2, price=130.0, pivot_type=PivotType.HIGH, level=StructureLevel.SWING)
        int_high = make_pivot(index=6, price=120.0, pivot_type=PivotType.HIGH, level=StructureLevel.INTERNAL)
        engine.register_pivot(swing_high)
        engine.register_pivot(int_high)

        # Huge expansion bar closes at 135.0 (breaking both 120.0 and 130.0)
        big_bar = make_bar(index=10, open_=115.0, high=140.0, low=114.0, close=135.0)
        events = engine.process_bar(big_bar)

        assert len(events) == 2

        internal_events = [e for e in events if e.level == StructureLevel.INTERNAL]
        swing_events = [e for e in events if e.level == StructureLevel.SWING]

        assert len(internal_events) == 1
        assert len(swing_events) == 1

        # Check internal event integrity
        assert internal_events[0].event_type == StructureType.BOS
        assert internal_events[0].broken_pivot_index == 6
        assert internal_events[0].broken_pivot_price == 120.0
        assert internal_events[0].trigger_price == 135.0

        # Check swing event integrity
        assert swing_events[0].event_type == StructureType.BOS
        assert swing_events[0].broken_pivot_index == 2
        assert swing_events[0].broken_pivot_price == 130.0
        assert swing_events[0].trigger_price == 135.0

    def test_internal_and_swing_can_hold_opposite_trends_concurrently(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        """
        Verify that swing can be in DOWNTREND while internal is in UPTREND (e.g., pullback phase),
        and break of internal high triggers internal BOS without affecting swing downtrend.
        """
        engine = MarketStructureEngine(
            initial_swing_trend=TrendDirection.DOWNTREND,
            initial_internal_trend=TrendDirection.UPTREND,
        )

        swing_low = make_pivot(index=1, price=80.0, pivot_type=PivotType.LOW, level=StructureLevel.SWING)
        swing_high = make_pivot(index=5, price=120.0, pivot_type=PivotType.HIGH, level=StructureLevel.SWING)
        engine.register_pivot(swing_low)
        engine.register_pivot(swing_high)

        int_low = make_pivot(index=6, price=85.0, pivot_type=PivotType.LOW, level=StructureLevel.INTERNAL)
        int_high = make_pivot(index=8, price=95.0, pivot_type=PivotType.HIGH, level=StructureLevel.INTERNAL)
        engine.register_pivot(int_low)
        engine.register_pivot(int_high)

        # Bar closes at 98.0 -> breaks internal high (95.0) in internal uptrend
        bar = make_bar(index=10, open_=94.0, high=99.0, low=93.0, close=98.0)
        events = engine.process_bar(bar)

        assert len(events) == 1
        assert events[0].level == StructureLevel.INTERNAL
        assert events[0].event_type == StructureType.BOS
        assert events[0].direction == TrendDirection.UPTREND
        assert events[0].broken_pivot_index == 8

        # Swing trend remains untouched DOWNTREND
        assert engine.get_trend(StructureLevel.SWING) == TrendDirection.DOWNTREND
        assert engine.get_trend(StructureLevel.INTERNAL) == TrendDirection.UPTREND


# ---------------------------------------------------------------------------
# Test Group 5: Edge Cases, Chronological Ordering & Error Handling
# ---------------------------------------------------------------------------

class TestEdgeCasesAndValidation:
    """Test boundary conditions, invalid chronology, and lifecycle consistency."""

    def test_out_of_order_bar_index_raises_value_error(
        self, make_bar: Callable[..., Bar]
    ) -> None:
        engine = MarketStructureEngine()
        bar_1 = make_bar(index=10, open_=100, high=102, low=99, close=101)
        engine.process_bar(bar_1)

        # Bar index decrements to 9
        bar_out_of_order = make_bar(index=9, open_=101, high=103, low=100, close=102)
        with pytest.raises(ValueError):
            engine.process_bar(bar_out_of_order)

    def test_out_of_order_bar_timestamp_raises_value_error(
        self, base_time: datetime
    ) -> None:
        engine = MarketStructureEngine()
        bar_1 = Bar(
            index=1,
            timestamp=base_time + timedelta(minutes=10),
            open=100.0,
            high=102.0,
            low=99.0,
            close=101.0,
            volume=100.0,
        )
        engine.process_bar(bar_1)

        # Newer index but older timestamp
        bar_2 = Bar(
            index=2,
            timestamp=base_time + timedelta(minutes=5),
            open=101.0,
            high=103.0,
            low=100.0,
            close=102.0,
            volume=100.0,
        )
        with pytest.raises(ValueError):
            engine.process_bar(bar_2)

    def test_out_of_order_pivot_registration_raises_value_error(
        self, make_pivot: Callable[..., Pivot]
    ) -> None:
        engine = MarketStructureEngine()
        p1 = make_pivot(index=10, price=100.0, pivot_type=PivotType.LOW, level=StructureLevel.SWING)
        engine.register_pivot(p1)

        # Register pivot with index lower than existing registered pivot
        p_invalid = make_pivot(index=8, price=110.0, pivot_type=PivotType.HIGH, level=StructureLevel.SWING)
        with pytest.raises(ValueError):
            engine.register_pivot(p_invalid)

    def test_processing_bars_without_any_pivots_returns_empty_events(
        self, make_bar: Callable[..., Bar]
    ) -> None:
        engine = MarketStructureEngine(initial_swing_trend=TrendDirection.UPTREND)
        bar = make_bar(index=1, open_=100, high=105, low=95, close=102)
        events = engine.process_bar(bar)
        assert events == []

    def test_engine_reset_clears_pivots_and_events(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        engine = MarketStructureEngine(initial_swing_trend=TrendDirection.UPTREND)
        p_high = make_pivot(index=5, price=110.0, pivot_type=PivotType.HIGH, level=StructureLevel.SWING)
        engine.register_pivot(p_high)

        bar = make_bar(index=6, open_=109.0, high=112.0, low=108.0, close=111.0)
        events = engine.process_bar(bar)
        assert len(events) == 1

        engine.reset()

        assert engine.get_active_pivot(StructureLevel.SWING, PivotType.HIGH) is None
        assert engine.get_trend(StructureLevel.SWING) is None

        # Re-processing new bars after reset starts with clean state
        bar_after_reset = make_bar(index=1, open_=109.0, high=112.0, low=108.0, close=111.0)
        assert engine.process_bar(bar_after_reset) == []


# ---------------------------------------------------------------------------
# Test Group 6: Event Listener / Telemetry Callback Integration (Mocked)
# ---------------------------------------------------------------------------

class TestEventListenerIntegration:
    """Verify that structure events are published to external listeners without network coupling."""

    def test_sync_listener_called_on_event_emission(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        mock_listener = MagicMock()
        engine = MarketStructureEngine(
            initial_swing_trend=TrendDirection.UPTREND,
            event_listener=mock_listener,
        )

        p_high = make_pivot(index=5, price=110.0, pivot_type=PivotType.HIGH, level=StructureLevel.SWING)
        engine.register_pivot(p_high)

        bar = make_bar(index=6, open_=109.0, high=112.0, low=108.0, close=111.5)
        events = engine.process_bar(bar)

        assert len(events) == 1
        mock_listener.assert_called_once_with(events[0])

    @pytest.mark.asyncio
    async def test_async_event_dispatcher_invoked_deterministically(
        self, make_bar: Callable[..., Bar], make_pivot: Callable[..., Pivot]
    ) -> None:
        mock_async_dispatcher = AsyncMock()

        # Engine handles async callback gracefully
        engine = MarketStructureEngine(
            initial_swing_trend=TrendDirection.UPTREND,
            async_event_listener=mock_async_dispatcher,
        )

        p_low = make_pivot(index=5, price=100.0, pivot_type=PivotType.LOW, level=StructureLevel.SWING)
        engine.register_pivot(p_low)

        # Bar triggers CHoCH
        reversal_bar = make_bar(index=6, open_=102.0, high=103.0, low=94.0, close=96.0)
        events = await engine.process_bar_async(reversal_bar)

        assert len(events) == 1
        assert events[0].event_type == StructureType.CHOCH
        mock_async_dispatcher.assert_awaited_once_with(events[0])