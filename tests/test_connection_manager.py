import asyncio
import json
import time
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Target module imports under test (these will fail until implementation is written)
from src.broadcaster.connection_manager import ConnectionManager
from src.broadcaster.feed_broadcaster import FeedBroadcaster
from src.api.websocket_router import WebSocketRouter


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def connection_manager() -> ConnectionManager:
    """Fixture providing a fresh ConnectionManager instance."""
    return ConnectionManager()


@pytest.fixture
def broadcaster(connection_manager: ConnectionManager) -> FeedBroadcaster:
    """Fixture providing FeedBroadcaster with 5ms SLA broadcast timeout."""
    return FeedBroadcaster(
        connection_manager=connection_manager,
        send_timeout_seconds=0.005,  # 5ms dispatch SLA constraint
    )


@pytest.fixture
def mock_ws() -> AsyncMock:
    """Fixture providing a mock WebSocket connection."""
    ws = AsyncMock()
    ws.send_text = AsyncMock(return_value=None)
    ws.send_json = AsyncMock(return_value=None)
    ws.accept = AsyncMock(return_value=None)
    ws.close = AsyncMock(return_value=None)
    return ws


@pytest.fixture
def sample_kline_payload() -> Dict[str, Any]:
    """Sample raw kline event ingested from upstream broker/feed."""
    return {
        "event_type": "kline",
        "symbol": "BTC/USDT",
        "timeframe": "1m",
        "timestamp": 1700000000000,
        "open": 43500.0,
        "high": 43550.0,
        "low": 43480.0,
        "close": 43520.5,
        "volume": 12.845,
        "is_closed": False,
    }


@pytest.fixture
def sample_trade_payload() -> Dict[str, Any]:
    """Sample raw trade event ingested from upstream broker/feed."""
    return {
        "event_type": "trade",
        "symbol": "BTC/USDT",
        "timestamp": 1700000000100,
        "trade_id": "tx_998124",
        "price": 43521.0,
        "size": 0.15,
        "side": "buy",
    }


# ---------------------------------------------------------------------------
# Unit Tests: ConnectionManager (src/broadcaster/connection_manager.py)
# ---------------------------------------------------------------------------

class TestConnectionManager:
    """Deterministic tests for connection registry and subscription bookkeeping."""

    def test_register_and_unregister_active_connection(self, connection_manager: ConnectionManager):
        ws = MagicMock()
        connection_manager.register(ws)
        assert connection_manager.is_connected(ws) is True
        assert connection_manager.active_connections_count == 1

        connection_manager.unregister(ws)
        assert connection_manager.is_connected(ws) is False
        assert connection_manager.active_connections_count == 0

    def test_subscribe_and_get_subscribers_by_channel(self, connection_manager: ConnectionManager):
        ws1, ws2 = MagicMock(), MagicMock()
        connection_manager.register(ws1)
        connection_manager.register(ws2)

        topic = "kline:BTC/USDT:1m"
        connection_manager.subscribe(ws1, topic)
        connection_manager.subscribe(ws2, topic)

        subscribers = connection_manager.get_subscribers(topic)
        assert len(subscribers) == 2
        assert ws1 in subscribers
        assert ws2 in subscribers

    def test_subscribe_unregistered_client_raises_exception(self, connection_manager: ConnectionManager):
        ws = MagicMock()
        # Subscribing without prior registration must raise KeyError or ValueError
        with pytest.raises(KeyError):
            connection_manager.subscribe(ws, "kline:BTC/USDT:1m")

    def test_unsubscribe_removes_client_from_specific_channel(self, connection_manager: ConnectionManager):
        ws = MagicMock()
        connection_manager.register(ws)
        topic_kline = "kline:BTC/USDT:1m"
        topic_trade = "trade:BTC/USDT"

        connection_manager.subscribe(ws, topic_kline)
        connection_manager.subscribe(ws, topic_trade)

        connection_manager.unsubscribe(ws, topic_kline)
        assert ws not in connection_manager.get_subscribers(topic_kline)
        assert ws in connection_manager.get_subscribers(topic_trade)

    def test_safe_remove_connection_clears_all_channel_subscriptions(self, connection_manager: ConnectionManager):
        ws = MagicMock()
        connection_manager.register(ws)
        topics = ["kline:BTC/USDT:1m", "kline:ETH/USDT:5m", "trade:SOL/USDT"]
        for t in topics:
            connection_manager.subscribe(ws, t)

        connection_manager.remove_connection(ws)

        for t in topics:
            assert ws not in connection_manager.get_subscribers(t)
        assert connection_manager.is_connected(ws) is False
        assert connection_manager.active_connections_count == 0

    def test_get_subscribers_for_nonexistent_topic_returns_empty_set(self, connection_manager: ConnectionManager):
        subscribers = connection_manager.get_subscribers("nonexistent_topic")
        assert subscribers == set()


# ---------------------------------------------------------------------------
# Unit Tests: FeedBroadcaster (src/broadcaster/feed_broadcaster.py)
# ---------------------------------------------------------------------------

class TestFeedBroadcaster:
    """Deterministic tests for routing, payload serialization, latency SLAs, and resilience."""

    @pytest.mark.asyncio
    async def test_kline_broadcast_routing_and_serialization_within_sla(
        self,
        broadcaster: FeedBroadcaster,
        connection_manager: ConnectionManager,
        sample_kline_payload: Dict[str, Any],
    ):
        """
        AC 1.2.1-1: Tick payload routed and serialized to active subscribers within 5ms.
        """
        matched_ws = AsyncMock()
        matched_ws.send_text = AsyncMock(return_value=None)
        unmatched_ws = AsyncMock()
        unmatched_ws.send_text = AsyncMock(return_value=None)

        connection_manager.register(matched_ws)
        connection_manager.register(unmatched_ws)

        # Matched client subscribes to BTC/USDT 1m
        connection_manager.subscribe(matched_ws, "kline:BTC/USDT:1m")
        # Unmatched client subscribes to ETH/USDT 1m
        connection_manager.subscribe(unmatched_ws, "kline:ETH/USDT:1m")

        start_time = time.perf_counter()
        await broadcaster.broadcast_kline(
            symbol="BTC/USDT",
            timeframe="1m",
            payload=sample_kline_payload,
        )
        elapsed_time = time.perf_counter() - start_time

        # Acceptance Criteria: Under 5ms (0.005s) delivery routing
        assert elapsed_time < 0.005, f"Broadcast took {elapsed_time:.6f}s, exceeding 5ms SLA"

        # Verify matched socket received properly serialized JSON
        matched_ws.send_text.assert_awaited_once()
        raw_sent = matched_ws.send_text.call_args[0][0]
        deserialized_data = json.loads(raw_sent)
        assert deserialized_data["symbol"] == "BTC/USDT"
        assert deserialized_data["close"] == 43520.5

        # Verify non-subscriber socket received nothing
        unmatched_ws.send_text.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_trade_tick_broadcast_routing(
        self,
        broadcaster: FeedBroadcaster,
        connection_manager: ConnectionManager,
        sample_trade_payload: Dict[str, Any],
    ):
        """Verify routing and serialization for trade ticks."""
        ws_trade_sub = AsyncMock()
        connection_manager.register(ws_trade_sub)
        connection_manager.subscribe(ws_trade_sub, "trade:BTC/USDT")

        await broadcaster.broadcast_trade(
            symbol="BTC/USDT",
            payload=sample_trade_payload,
        )

        ws_trade_sub.send_text.assert_awaited_once()
        sent_payload = json.loads(ws_trade_sub.send_text.call_args[0][0])
        assert sent_payload["trade_id"] == "tx_998124"
        assert sent_payload["price"] == 43521.0

    @pytest.mark.asyncio
    async def test_hanging_subscriber_removed_without_delaying_peers(
        self,
        broadcaster: FeedBroadcaster,
        connection_manager: ConnectionManager,
        sample_kline_payload: Dict[str, Any],
    ):
        """
        AC 1.2.1-2: When a single client hangs, safely remove stale connection
        without delaying message delivery to remaining peers.
        """
        channel = "kline:BTC/USDT:1m"

        # Fast peer 1
        fast_peer_1 = AsyncMock()
        fast_peer_1.send_text = AsyncMock(return_value=None)

        # Hanging peer (simulates blocked TCP socket / network buffer saturation)
        hanging_peer = AsyncMock()

        async def slow_send(*args, **kwargs):
            await asyncio.sleep(0.5)  # 500ms delay, far exceeding 5ms SLA

        hanging_peer.send_text = AsyncMock(side_effect=slow_send)

        # Fast peer 2
        fast_peer_2 = AsyncMock()
        fast_peer_2.send_text = AsyncMock(return_value=None)

        for ws in (fast_peer_1, hanging_peer, fast_peer_2):
            connection_manager.register(ws)
            connection_manager.subscribe(ws, channel)

        start_time = time.perf_counter()
        await broadcaster.broadcast_kline(
            symbol="BTC/USDT",
            timeframe="1m",
            payload=sample_kline_payload,
        )
        total_broadcast_time = time.perf_counter() - start_time

        # Total time must not be held hostage by the 500ms hanging connection
        assert total_broadcast_time < 0.05, f"Broadcast blocked for {total_broadcast_time:.4f}s"

        # Fast peers must have received the frame without dropping
        fast_peer_1.send_text.assert_awaited_once()
        fast_peer_2.send_text.assert_awaited_once()

        # Hanging peer must be evicted from connection manager
        assert connection_manager.is_connected(hanging_peer) is False
        assert hanging_peer not in connection_manager.get_subscribers(channel)

    @pytest.mark.asyncio
    async def test_abrupt_disconnect_during_broadcast_evicts_stale_client(
        self,
        broadcaster: FeedBroadcaster,
        connection_manager: ConnectionManager,
        sample_kline_payload: Dict[str, Any],
    ):
        """
        AC 1.2.1-2: Sockets raising ConnectionResetError or broken pipe are cleaned up
        instantly and peers receive frames safely.
        """
        channel = "kline:BTC/USDT:1m"

        healthy_client = AsyncMock()
        healthy_client.send_text = AsyncMock(return_value=None)

        broken_client = AsyncMock()
        broken_client.send_text = AsyncMock(side_effect=ConnectionResetError("Peer reset connection"))

        connection_manager.register(healthy_client)
        connection_manager.register(broken_client)
        connection_manager.subscribe(healthy_client, channel)
        connection_manager.subscribe(broken_client, channel)

        # Broadcast should absorb client exception and clean up broken client
        await broadcaster.broadcast_kline("BTC/USDT", "1m", sample_kline_payload)

        healthy_client.send_text.assert_awaited_once()
        assert connection_manager.is_connected(broken_client) is False
        assert broken_client not in connection_manager.get_subscribers(channel)
        assert broken_client.close.awaited

    @pytest.mark.asyncio
    async def test_broadcast_with_no_subscribers_completes_safely(
        self,
        broadcaster: FeedBroadcaster,
        sample_kline_payload: Dict[str, Any],
    ):
        """Ensure no failure occurs when broadcasting to an empty channel."""
        # Empty channel, should run cleanly
        await broadcaster.broadcast_kline("UNKNOWN/USDT", "1h", sample_kline_payload)


# ---------------------------------------------------------------------------
# Unit Tests: WebSocketRouter (src/api/websocket_router.py)
# ---------------------------------------------------------------------------

class TestWebSocketRouter:
    """Deterministic tests for WebSocket API connection lifecycle and inbound dispatch."""

    @pytest.fixture
    def router(
        self,
        connection_manager: ConnectionManager,
        broadcaster: FeedBroadcaster,
    ) -> WebSocketRouter:
        return WebSocketRouter(
            connection_manager=connection_manager,
            feed_broadcaster=broadcaster,
        )

    @pytest.mark.asyncio
    async def test_router_accepts_and_registers_connection(
        self,
        router: WebSocketRouter,
        connection_manager: ConnectionManager,
        mock_ws: AsyncMock,
    ):
        mock_ws.receive_text = AsyncMock(side_effect=[
            json.dumps({"action": "subscribe", "topic": "kline:BTC/USDT:1m"}),
            asyncio.CancelledError(),  # Terminate infinite loop
        ])

        try:
            await router.handle_connection(mock_ws)
        except asyncio.CancelledError:
            pass

        mock_ws.accept.assert_awaited_once()
        assert connection_manager.is_connected(mock_ws) is True
        assert mock_ws in connection_manager.get_subscribers("kline:BTC/USDT:1m")

    @pytest.mark.asyncio
    async def test_router_handles_unsubscribe_action(
        self,
        router: WebSocketRouter,
        connection_manager: ConnectionManager,
        mock_ws: AsyncMock,
    ):
        topic = "trade:ETH/USDT"
        mock_ws.receive_text = AsyncMock(side_effect=[
            json.dumps({"action": "subscribe", "topic": topic}),
            json.dumps({"action": "unsubscribe", "topic": topic}),
            asyncio.CancelledError(),
        ])

        try:
            await router.handle_connection(mock_ws)
        except asyncio.CancelledError:
            pass

        assert mock_ws not in connection_manager.get_subscribers(topic)

    @pytest.mark.asyncio
    async def test_router_client_disconnect_triggers_cleanup(
        self,
        router: WebSocketRouter,
        connection_manager: ConnectionManager,
        mock_ws: AsyncMock,
    ):
        topic = "kline:BTC/USDT:1m"
        # Simulate connection drop after subscribing
        mock_ws.receive_text = AsyncMock(side_effect=[
            json.dumps({"action": "subscribe", "topic": topic}),
            ConnectionResetError(),
        ])

        await router.handle_connection(mock_ws)

        assert connection_manager.is_connected(mock_ws) is False
        assert mock_ws not in connection_manager.get_subscribers(topic)

    @pytest.mark.asyncio
    async def test_router_rejects_malformed_json_without_disconnecting(
        self,
        router: WebSocketRouter,
        connection_manager: ConnectionManager,
        mock_ws: AsyncMock,
    ):
        mock_ws.receive_text = AsyncMock(side_effect=[
            "NOT_VALID_JSON_STRING",
            asyncio.CancelledError(),
        ])

        try:
            await router.handle_connection(mock_ws)
        except asyncio.CancelledError:
            pass

        # Router should return an error frame to the client rather than silently failing
        mock_ws.send_text.assert_awaited()
        last_call_arg = mock_ws.send_text.call_args[0][0]
        error_msg = json.loads(last_call_arg)
        assert "error" in error_msg
        assert connection_manager.is_connected(mock_ws) is True

    @pytest.mark.asyncio
    async def test_router_rejects_unsupported_action(
        self,
        router: WebSocketRouter,
        mock_ws: AsyncMock,
    ):
        mock_ws.receive_text = AsyncMock(side_effect=[
            json.dumps({"action": "unsupported_action", "topic": "trade:BTC/USDT"}),
            asyncio.CancelledError(),
        ])

        try:
            await router.handle_connection(mock_ws)
        except asyncio.CancelledError:
            pass

        mock_ws.send_text.assert_awaited()
        error_payload = json.loads(mock_ws.send_text.call_args[0][0])
        assert error_payload["status"] == "error"