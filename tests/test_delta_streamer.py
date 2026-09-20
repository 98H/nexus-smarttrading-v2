"""
Unit tests for L2 Orderbook Delta Streamer.
Specification: Story 1.2.2: L2 Orderbook Delta Streamer
Target Modules:
    - src/orderbook/models.py
    - src/orderbook/delta_streamer.py
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest

from src.orderbook.models import (
    DeltaAction,
    LevelDelta,
    OrderBookDelta,
    RawL2Update,
    Side,
)
from src.orderbook.delta_streamer import L2DeltaStreamer


# ============================================================================
# Models Unit Tests
# ============================================================================

class TestOrderbookModels:
    """Tests for Orderbook domain models and validations."""

    def test_delta_action_enum_values(self):
        """Verify DeltaAction enum defines required delta operations."""
        assert DeltaAction.INSERT.value == "INSERT"
        assert DeltaAction.UPDATE.value == "UPDATE"
        assert DeltaAction.DELETE.value == "DELETE"

    def test_side_enum_values(self):
        """Verify Side enum defines bid and ask orderbook sides."""
        assert Side.BID.value == "BID"
        assert Side.ASK.value == "ASK"

    def test_level_delta_creation_valid(self):
        """Verify LevelDelta initializes correctly with valid parameters."""
        delta = LevelDelta(
            side=Side.BID,
            action=DeltaAction.INSERT,
            price=50000.5,
            size=1.25,
        )
        assert delta.side == Side.BID
        assert delta.action == DeltaAction.INSERT
        assert delta.price == 50000.5
        assert delta.size == 1.25

    def test_level_delta_invalid_price_raises_value_error(self):
        """Given a non-positive price, LevelDelta must raise ValueError."""
        with pytest.raises(ValueError):
            LevelDelta(
                side=Side.BID,
                action=DeltaAction.INSERT,
                price=0.0,
                size=1.0,
            )

        with pytest.raises(ValueError):
            LevelDelta(
                side=Side.BID,
                action=DeltaAction.INSERT,
                price=-10.0,
                size=1.0,
            )

    def test_level_delta_invalid_size_raises_value_error(self):
        """Given a negative size, LevelDelta must raise ValueError."""
        with pytest.raises(ValueError):
            LevelDelta(
                side=Side.ASK,
                action=DeltaAction.UPDATE,
                price=100.0,
                size=-0.5,
            )

    def test_orderbook_delta_is_empty_property(self):
        """Verify OrderBookDelta.is_empty identifies presence/absence of updates."""
        empty_delta = OrderBookDelta(
            symbol="BTC/USDT",
            timestamp=1672531199000,
            bids=[],
            asks=[],
        )
        assert empty_delta.is_empty is True

        delta_with_bids = OrderBookDelta(
            symbol="BTC/USDT",
            timestamp=1672531199000,
            bids=[LevelDelta(Side.BID, DeltaAction.INSERT, 50000.0, 1.0)],
            asks=[],
        )
        assert delta_with_bids.is_empty is False

        delta_with_asks = OrderBookDelta(
            symbol="BTC/USDT",
            timestamp=1672531199000,
            bids=[],
            asks=[LevelDelta(Side.ASK, DeltaAction.DELETE, 50100.0, 0.0)],
        )
        assert delta_with_asks.is_empty is False

    def test_raw_l2_update_validation(self):
        """Verify RawL2Update holds CCXT-style raw bid/ask depth updates."""
        update = RawL2Update(
            symbol="BTC/USDT",
            timestamp=1672531199100,
            bids=[(50000.0, 1.5), (49990.0, 2.0)],
            asks=[(50010.0, 0.8)],
        )
        assert update.symbol == "BTC/USDT"
        assert len(update.bids) == 2
        assert len(update.asks) == 1


# ============================================================================
# Delta Calculation & State Management Tests
# ============================================================================

class TestDeltaStreamerCalculations:
    """Tests delta calculation against internal orderbook state."""

    @pytest.fixture
    def streamer(self):
        """Return an unstarted L2DeltaStreamer instance configured for tests."""
        return L2DeltaStreamer(symbol="BTC/USDT", throttle_interval_ms=100)

    def test_initial_snapshot_generates_insert_deltas(self, streamer):
        """
        Given an initial empty orderbook,
        When raw L2 depth arrives,
        Then all incoming price levels must be emitted as INSERT deltas.
        """
        raw = RawL2Update(
            symbol="BTC/USDT",
            timestamp=1000,
            bids=[(50000.0, 1.0), (49900.0, 2.0)],
            asks=[(50100.0, 3.0), (50200.0, 4.0)],
        )
        streamer.ingest_raw_update(raw)
        delta = streamer.compute_pending_delta(timestamp=1100)

        assert delta is not None
        assert not delta.is_empty
        assert len(delta.bids) == 2
        assert all(b.action == DeltaAction.INSERT for b in delta.bids)
        assert len(delta.asks) == 2
        assert all(a.action == DeltaAction.INSERT for a in delta.asks)

    def test_updated_level_size_generates_update_delta(self, streamer):
        """
        Given an existing price level,
        When raw depth indicates a modified size > 0,
        Then an UPDATE delta must be generated.
        """
        # Seed book
        streamer.ingest_raw_update(
            RawL2Update("BTC/USDT", 1000, bids=[(50000.0, 1.0)], asks=[(50100.0, 2.0)])
        )
        streamer.compute_pending_delta(timestamp=1100)  # Flush initial

        # Modify size
        streamer.ingest_raw_update(
            RawL2Update("BTC/USDT", 1150, bids=[(50000.0, 3.5)], asks=[(50100.0, 2.0)])
        )
        delta = streamer.compute_pending_delta(timestamp=1200)

        assert delta is not None
        assert len(delta.bids) == 1
        assert delta.bids[0].action == DeltaAction.UPDATE
        assert delta.bids[0].price == 50000.0
        assert delta.bids[0].size == 3.5
        assert len(delta.asks) == 0

    def test_zero_size_level_generates_delete_delta(self, streamer):
        """
        Given an existing price level,
        When raw depth specifies size == 0 (CCXT removal convention),
        Then a DELETE delta must be generated and the level removed from book.
        """
        # Seed book
        streamer.ingest_raw_update(
            RawL2Update("BTC/USDT", 1000, bids=[(50000.0, 1.0)], asks=[(50100.0, 2.0)])
        )
        streamer.compute_pending_delta(timestamp=1100)

        # Remove ask level with size 0
        streamer.ingest_raw_update(
            RawL2Update("BTC/USDT", 1150, bids=[], asks=[(50100.0, 0.0)])
        )
        delta = streamer.compute_pending_delta(timestamp=1200)

        assert delta is not None
        assert len(delta.asks) == 1
        assert delta.asks[0].action == DeltaAction.DELETE
        assert delta.asks[0].price == 50100.0
        assert delta.asks[0].size == 0.0

        # Further compute should show no pending changes
        next_delta = streamer.compute_pending_delta(timestamp=1300)
        assert next_delta is None or next_delta.is_empty

    def test_multiple_modifications_on_same_level_coalesce_within_interval(self, streamer):
        """
        Given multiple updates to the same price level within one throttle window,
        When delta is calculated,
        Then only the net change against the last emitted state is generated.
        """
        # Initial snapshot
        streamer.ingest_raw_update(
            RawL2Update("BTC/USDT", 1000, bids=[(50000.0, 1.0)], asks=[])
        )
        streamer.compute_pending_delta(timestamp=1100)

        # Multiple changes within next 100ms interval
        streamer.ingest_raw_update(
            RawL2Update("BTC/USDT", 1120, bids=[(50000.0, 2.0)], asks=[])
        )
        streamer.ingest_raw_update(
            RawL2Update("BTC/USDT", 1140, bids=[(50000.0, 3.0)], asks=[])
        )
        streamer.ingest_raw_update(
            RawL2Update("BTC/USDT", 1180, bids=[(50000.0, 5.0)], asks=[])
        )

        delta = streamer.compute_pending_delta(timestamp=1200)

        assert delta is not None
        assert len(delta.bids) == 1
        assert delta.bids[0].action == DeltaAction.UPDATE
        assert delta.bids[0].price == 50000.0
        assert delta.bids[0].size == 5.0

    def test_level_inserted_and_deleted_within_interval_emits_no_delta(self, streamer):
        """
        Given a level is added and subsequently removed within the same throttle interval,
        When delta is computed,
        Then net delta for that level is empty.
        """
        # Initial state
        streamer.ingest_raw_update(
            RawL2Update("BTC/USDT", 1000, bids=[(50000.0, 1.0)], asks=[])
        )
        streamer.compute_pending_delta(timestamp=1100)

        # Transient level introduced and removed
        streamer.ingest_raw_update(
            RawL2Update("BTC/USDT", 1120, bids=[(49990.0, 2.0)], asks=[])
        )
        streamer.ingest_raw_update(
            RawL2Update("BTC/USDT", 1150, bids=[(49990.0, 0.0)], asks=[])
        )

        delta = streamer.compute_pending_delta(timestamp=1200)
        assert delta is None or delta.is_empty


# ============================================================================
# Acceptance Criteria & Throttling Unit Tests
# ============================================================================

class TestDeltaStreamerThrottlingAndSuppression:
    """Tests for AC: 100ms throttle timer and suppression of empty deltas."""

    @pytest.mark.asyncio
    async def test_throttling_interval_default_100ms(self):
        """Verify default throttle interval is 100ms."""
        streamer = L2DeltaStreamer(symbol="ETH/USDT")
        assert streamer.throttle_interval_ms == 100

    @pytest.mark.asyncio
    async def test_acceptance_criteria_1_delta_emitted_at_throttled_interval(self):
        """
        AC 1: Given continuous raw L2 depth updates from CCXT,
        When bid or ask price/size levels change,
        Then calculate differential updates and emit them as delta messages at 100ms intervals.
        """
        consumer_mock = AsyncMock()
        streamer = L2DeltaStreamer(
            symbol="BTC/USDT",
            throttle_interval_ms=100,
            on_delta=consumer_mock,
        )

        await streamer.start()
        try:
            # First change
            raw1 = RawL2Update(
                symbol="BTC/USDT",
                timestamp=1000,
                bids=[(30000.0, 1.0)],
                asks=[(30100.0, 2.0)],
            )
            await streamer.push_update(raw1)

            # Wait 50ms: middle of throttle interval -> no delta should be emitted yet
            await asyncio.sleep(0.05)
            assert consumer_mock.call_count == 0

            # Wait past the 100ms boundary
            await asyncio.sleep(0.07)
            assert consumer_mock.call_count == 1
            emitted_delta: OrderBookDelta = consumer_mock.call_args[0][0]
            assert emitted_delta.symbol == "BTC/USDT"
            assert len(emitted_delta.bids) == 1
            assert emitted_delta.bids[0].action == DeltaAction.INSERT
            assert len(emitted_delta.asks) == 1
            assert emitted_delta.asks[0].action == DeltaAction.INSERT

        finally:
            await streamer.stop()

    @pytest.mark.asyncio
    async def test_acceptance_criteria_2_suppress_empty_deltas_on_no_changes(self):
        """
        AC 2: Given an interval where no orderbook changes occur,
        When the 100ms throttle timer elapses,
        Then suppress emission of empty deltas to downstream clients.
        """
        consumer_mock = AsyncMock()
        streamer = L2DeltaStreamer(
            symbol="BTC/USDT",
            throttle_interval_ms=100,
            on_delta=consumer_mock,
        )

        await streamer.start()
        try:
            # Ingest initial state
            await streamer.push_update(
                RawL2Update(
                    symbol="BTC/USDT",
                    timestamp=1000,
                    bids=[(20000.0, 1.0)],
                    asks=[(20100.0, 1.0)],
                )
            )

            # Let initial 100ms interval emit
            await asyncio.sleep(0.12)
            assert consumer_mock.call_count == 1

            # Reset mock call counter
            consumer_mock.reset_mock()

            # Wait for another full 100ms interval with NO incoming updates
            await asyncio.sleep(0.12)

            # Assert empty delta was suppressed
            consumer_mock.assert_not_called()

        finally:
            await streamer.stop()

    @pytest.mark.asyncio
    async def test_acceptance_criteria_2_suppress_redundant_identical_updates(self):
        """
        AC 2: Given updates containing identical price and size already in the book,
        When 100ms elapses,
        Then empty delta is suppressed because no net differential exists.
        """
        consumer_mock = AsyncMock()
        streamer = L2DeltaStreamer(
            symbol="BTC/USDT",
            throttle_interval_ms=100,
            on_delta=consumer_mock,
        )

        await streamer.start()
        try:
            # Seed state
            await streamer.push_update(
                RawL2Update(
                    symbol="BTC/USDT",
                    timestamp=1000,
                    bids=[(20000.0, 1.0)],
                    asks=[(20100.0, 1.0)],
                )
            )
            await asyncio.sleep(0.12)
            assert consumer_mock.call_count == 1
            consumer_mock.reset_mock()

            # Push identical price/size raw updates during next window
            await streamer.push_update(
                RawL2Update(
                    symbol="BTC/USDT",
                    timestamp=1150,
                    bids=[(20000.0, 1.0)],
                    asks=[(20100.0, 1.0)],
                )
            )

            # Wait for interval to elapse
            await asyncio.sleep(0.12)

            # Net delta is empty, emission must be suppressed
            consumer_mock.assert_not_called()

        finally:
            await streamer.stop()

    @pytest.mark.asyncio
    async def test_queue_based_consumption(self):
        """
        Verify downstream clients can consume deltas via an asyncio.Queue interface.
        """
        streamer = L2DeltaStreamer(symbol="SOL/USDT", throttle_interval_ms=100)
        output_queue = streamer.get_delta_queue()

        await streamer.start()
        try:
            await streamer.push_update(
                RawL2Update(
                    symbol="SOL/USDT",
                    timestamp=5000,
                    bids=[(100.0, 10.0)],
                    asks=[(101.0, 5.0)],
                )
            )

            # Queue should receive the delta after throttle elapses
            delta = await asyncio.wait_for(output_queue.get(), timeout=0.3)
            assert isinstance(delta, OrderBookDelta)
            assert delta.symbol == "SOL/USDT"
            assert len(delta.bids) == 1
            assert len(delta.asks) == 1

            # Subsequent idle window does not push anything to queue
            with pytest.raises(asyncio.TimeoutError):
                await asyncio.wait_for(output_queue.get(), timeout=0.15)

        finally:
            await streamer.stop()


# ============================================================================
# Robustness, Error Handling & Lifecycle Tests
# ============================================================================

class TestDeltaStreamerLifecycleAndResilience:
    """Tests for streamer lifecycle, task cleanup, and edge error conditions."""

    @pytest.mark.asyncio
    async def test_start_called_twice_is_safe(self):
        """Ensure calling start() on an already running streamer is idempotent."""
        streamer = L2DeltaStreamer(symbol="BTC/USDT", throttle_interval_ms=100)
        await streamer.start()
        try:
            assert streamer.is_running is True
            # Second call should not create duplicate tasks or crash
            await streamer.start()
            assert streamer.is_running is True
        finally:
            await streamer.stop()

    @pytest.mark.asyncio
    async def test_stop_gracefully_cancels_background_task(self):
        """Ensure stop() properly cancels throttle loop without leaking tasks."""
        streamer = L2DeltaStreamer(symbol="BTC/USDT", throttle_interval_ms=100)
        await streamer.start()
        assert streamer.is_running is True

        await streamer.stop()
        assert streamer.is_running is False

    @pytest.mark.asyncio
    async def test_push_update_mismatched_symbol_raises_value_error(self):
        """Streamer configured for symbol X must reject updates for symbol Y."""
        streamer = L2DeltaStreamer(symbol="BTC/USDT", throttle_interval_ms=100)
        mismatched_update = RawL2Update(
            symbol="ETH/USDT",
            timestamp=1000,
            bids=[(1500.0, 2.0)],
            asks=[],
        )

        with pytest.raises(ValueError):
            await streamer.push_update(mismatched_update)

    @pytest.mark.asyncio
    async def test_consumer_exception_does_not_kill_streamer(self):
        """
        Ensure that an exception raised by the downstream callback
        is handled and does not terminate the streamer's background loop.
        """
        failing_consumer = AsyncMock(side_effect=[Exception("Downstream network failure"), None])
        streamer = L2DeltaStreamer(
            symbol="BTC/USDT",
            throttle_interval_ms=50,
            on_delta=failing_consumer,
        )

        await streamer.start()
        try:
            # First update -> consumer will raise
            await streamer.push_update(
                RawL2Update("BTC/USDT", 1000, bids=[(50000.0, 1.0)], asks=[])
            )
            await asyncio.sleep(0.08)
            assert failing_consumer.call_count == 1

            # Streamer should still be running
            assert streamer.is_running is True

            # Second update -> consumer succeeds
            await streamer.push_update(
                RawL2Update("BTC/USDT", 1100, bids=[(50000.0, 2.0)], asks=[])
            )
            await asyncio.sleep(0.08)
            assert failing_consumer.call_count == 2

        finally:
            await streamer.stop()

    def test_invalid_throttle_interval_raises_value_error(self):
        """Streamer must validate that throttle interval is strictly positive."""
        with pytest.raises(ValueError):
            L2DeltaStreamer(symbol="BTC/USDT", throttle_interval_ms=0)

        with pytest.raises(ValueError):
            L2DeltaStreamer(symbol="BTC/USDT", throttle_interval_ms=-50)


# ============================================================================
# CCXT Integration Simulation Tests (Mocked Sandbox)
# ============================================================================

class TestCCXTDepthUpdateIntegration:
    """
    Tests simulation of incoming raw CCXT depth structures.
    CCXT depth returns: {'symbol': str, 'bids': [[price, size], ...], 'asks': [[price, size], ...], 'timestamp': int}
    """

    @pytest.mark.asyncio
    async def test_ccxt_raw_payload_transformation(self):
        """
        Given raw dict updates typical of CCXT `watch_order_book` or `fetch_order_book`,
        When ingested via streamer adapter,
        Then properly structured deltas are computed.
        """
        streamer = L2DeltaStreamer(symbol="ADA/USDT", throttle_interval_ms=50)
        output_queue = streamer.get_delta_queue()

        ccxt_payload = {
            "symbol": "ADA/USDT",
            "timestamp": 1672531200000,
            "bids": [[0.35, 1000.0], [0.34, 2500.0]],
            "asks": [[0.36, 1200.0], [0.37, 3000.0]],
        }

        await streamer.start()
        try:
            await streamer.push_ccxt_update(ccxt_payload)
            delta: OrderBookDelta = await asyncio.wait_for(output_queue.get(), timeout=0.2)

            assert delta.symbol == "ADA/USDT"
            assert len(delta.bids) == 2
            assert len(delta.asks) == 2

            # Check sort order: bids descending price, asks ascending price
            assert delta.bids[0].price == 0.35
            assert delta.bids[1].price == 0.34
            assert delta.asks[0].price == 0.36
            assert delta.asks[1].price == 0.37

        finally:
            await streamer.stop()

    @pytest.mark.asyncio
    async def test_ccxt_intermittent_burst_coalescing(self):
        """
        Given high frequency bursts of CCXT updates within 100ms,
        When throttled,
        Then exactly 1 coalesced delta is emitted representing net state changes.
        """
        consumer_mock = AsyncMock()
        streamer = L2DeltaStreamer(
            symbol="ETH/USDT",
            throttle_interval_ms=100,
            on_delta=consumer_mock,
        )

        await streamer.start()
        try:
            # Rapid fire 5 updates in quick succession (< 20ms total)
            base_time = 1672531200000
            for i in range(1, 6):
                await streamer.push_ccxt_update({
                    "symbol": "ETH/USDT",
                    "timestamp": base_time + i,
                    "bids": [[1800.0, float(i)]],
                    "asks": [[1801.0, 10.0]],
                })

            # Allow throttle timer to trigger
            await asyncio.sleep(0.15)

            # Should emit exactly one coalesced delta for this window
            assert consumer_mock.call_count == 1
            delta: OrderBookDelta = consumer_mock.call_args[0][0]
            assert delta.bids[0].price == 1800.0
            assert delta.bids[0].size == 5.0  # Final coalesced size
            assert delta.asks[0].price == 1801.0
            assert delta.asks[0].size == 10.0

        finally:
            await streamer.stop()