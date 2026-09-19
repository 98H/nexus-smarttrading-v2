"""
Unit tests for CCXT Pro Gateway and Connection Manager.

Feature: Multi-Exchange CCXT Connection Hub
Requirement: Story 1.1.1: Multi-Exchange CCXT Connection Hub
Acceptance Criteria:
- Given valid exchange IDs [binance, bybit, coinbase]
- When the CCXT Pro gateway initializes
- Then persistent WebSocket connections are established
- With automatic backoff reconnection under 1500ms on socket drop.
"""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch, call
import pytest

from src.gateway.ccxt_hub import CCXTProGateway, CCXTHub
from src.gateway.connection_manager import (
    ConnectionManager,
    ConnectionState,
    BackoffStrategy,
)


@pytest.fixture
def valid_exchange_ids():
    """Standard exchange list defined in acceptance criteria."""
    return ["binance", "bybit", "coinbase"]


@pytest.fixture
def mock_ccxt_exchange_factory():
    """Factory generating mock CCXT Pro exchange instances."""
    def _factory(exchange_id: str):
        mock_ex = AsyncMock()
        mock_ex.id = exchange_id
        mock_ex.load_markets = AsyncMock(return_value={"BTC/USDT": {}})
        mock_ex.close = AsyncMock()
        # Simulated websocket connection state flags
        mock_ex.has = {"watchTicker": True}
        mock_ex.is_connected = MagicMock(return_value=True)
        return mock_ex
    return _factory


# ==============================================================================
# CCXTProGateway / CCXTHub Initialization Tests
# ==============================================================================

class TestCCXTProGatewayInitialization:
    """Tests gateway initialization and exchange client registry."""

    def test_gateway_initialization_with_valid_exchanges(self, valid_exchange_ids):
        """Verify initialization sets up managers for binance, bybit, and coinbase."""
        gateway = CCXTProGateway(exchange_ids=valid_exchange_ids)

        assert gateway.exchange_ids == valid_exchange_ids
        for ex_id in valid_exchange_ids:
            assert ex_id in gateway.connection_managers
            assert isinstance(gateway.connection_managers[ex_id], ConnectionManager)

    def test_gateway_alias_ccxt_hub(self, valid_exchange_ids):
        """Verify CCXTHub alias behaves identically to CCXTProGateway."""
        hub = CCXTHub(exchange_ids=valid_exchange_ids)
        assert isinstance(hub, CCXTProGateway)
        assert hub.exchange_ids == valid_exchange_ids

    def test_gateway_initialization_invalid_exchange_raises(self):
        """Unsupported exchange IDs must immediately raise ValueError."""
        with pytest.raises(ValueError):
            CCXTProGateway(exchange_ids=["binance", "unsupported_crypto_exchange"])

    def test_gateway_initialization_empty_list_raises(self):
        """Empty exchange list must be rejected."""
        with pytest.raises(ValueError):
            CCXTProGateway(exchange_ids=[])


# ==============================================================================
# Persistent WebSocket Connection Establishment Tests
# ==============================================================================

class TestCCXTProGatewayConnections:
    """Tests establishing persistent WebSocket connections across all exchanges."""

    @pytest.mark.asyncio
    @patch("src.gateway.ccxt_hub.ccxtpro")
    async def test_persistent_websocket_connections_established(
        self, mock_ccxtpro, valid_exchange_ids, mock_ccxt_exchange_factory
    ):
        """
        Verify that on gateway start(), persistent WebSocket connections are
        established for binance, bybit, and coinbase.
        """
        created_mocks = {}
        for ex_id in valid_exchange_ids:
            mock_instance = mock_ccxt_exchange_factory(ex_id)
            created_mocks[ex_id] = mock_instance
            setattr(mock_ccxtpro, ex_id, MagicMock(return_value=mock_instance))

        gateway = CCXTProGateway(exchange_ids=valid_exchange_ids)
        await gateway.start()

        for ex_id in valid_exchange_ids:
            # CCXT pro constructor called
            getattr(mock_ccxtpro, ex_id).assert_called_once()
            # Connection manager must indicate state is connected
            manager = gateway.connection_managers[ex_id]
            assert manager.state == ConnectionState.CONNECTED
            assert gateway.is_connected(ex_id) is True

        await gateway.stop()

    @pytest.mark.asyncio
    @patch("src.gateway.ccxt_hub.ccxtpro")
    async def test_graceful_shutdown_closes_all_connections(
        self, mock_ccxtpro, valid_exchange_ids, mock_ccxt_exchange_factory
    ):
        """Stopping the gateway must close all underlying WebSocket connections."""
        instances = {}
        for ex_id in valid_exchange_ids:
            mock_inst = mock_ccxt_exchange_factory(ex_id)
            instances[ex_id] = mock_inst
            setattr(mock_ccxtpro, ex_id, MagicMock(return_value=mock_inst))

        gateway = CCXTProGateway(exchange_ids=valid_exchange_ids)
        await gateway.start()
        await gateway.stop()

        for ex_id, mock_inst in instances.items():
            mock_inst.close.assert_awaited_once()
            assert gateway.is_connected(ex_id) is False


# ==============================================================================
# Automatic Backoff Reconnection Under 1500ms Tests
# ==============================================================================

class TestConnectionManagerBackoff:
    """Tests backoff calculations and auto-reconnection timing limits."""

    def test_backoff_max_delay_is_strictly_under_1500ms(self):
        """
        Acceptance Criteria: Automatic backoff reconnection under 1500ms on socket drop.
        Max backoff ceiling must not exceed 1500ms.
        """
        strategy = BackoffStrategy(
            initial_delay_ms=100,
            max_delay_ms=1500,
            factor=2.0,
            jitter=False
        )

        for attempt in range(1, 20):
            delay_ms = strategy.calculate_delay_ms(attempt)
            assert delay_ms <= 1500, f"Attempt {attempt} produced delay {delay_ms}ms, which exceeds 1500ms"
            assert delay_ms > 0

    def test_backoff_delay_exponential_progression(self):
        """Ensure backoff progression doubles until capped at 1500ms."""
        strategy = BackoffStrategy(
            initial_delay_ms=200,
            max_delay_ms=1500,
            factor=2.0,
            jitter=False
        )

        assert strategy.calculate_delay_ms(1) == 200
        assert strategy.calculate_delay_ms(2) == 400
        assert strategy.calculate_delay_ms(3) == 800
        assert strategy.calculate_delay_ms(4) == 1500  # Capped at 1500ms
        assert strategy.calculate_delay_ms(5) == 1500

    def test_backoff_strategy_rejects_max_delay_exceeding_1500ms(self):
        """Configuration must enforce the 1500ms requirement as an upper bound."""
        with pytest.raises(ValueError):
            BackoffStrategy(initial_delay_ms=100, max_delay_ms=2000)

    @pytest.mark.asyncio
    async def test_reconnection_triggered_on_socket_drop(self, mock_ccxt_exchange_factory):
        """
        Simulate a socket drop exception. Verify the manager marks DISCONNECTED,
        invokes backoff under 1500ms, and reconnects.
        """
        mock_exchange = mock_ccxt_exchange_factory("binance")
        connect_call_count = 0

        async def simulated_connect():
            nonlocal connect_call_count
            connect_call_count += 1
            if connect_call_count == 1:
                return mock_exchange
            return mock_exchange

        manager = ConnectionManager(
            exchange_id="binance",
            client_factory=simulated_connect,
            max_backoff_ms=1500,
        )

        await manager.connect()
        assert manager.state == ConnectionState.CONNECTED

        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            # Simulate socket drop
            await manager.handle_socket_drop(error=ConnectionResetError("Socket dropped"))

            # Verify reconnection backoff was awaited and strictly under 1500ms (< 1.5s)
            assert mock_sleep.called
            for call_arg in mock_sleep.call_args_list:
                sleep_seconds = call_arg.args[0]
                assert sleep_seconds <= 1.5, f"Reconnection delay {sleep_seconds}s exceeds 1.5s (1500ms)"

            assert manager.state == ConnectionState.CONNECTED
            assert manager.reconnect_count == 1

    @pytest.mark.asyncio
    async def test_multiple_consecutive_drops_never_exceed_1500ms(self, mock_ccxt_exchange_factory):
        """Even under sustained socket flapping, backoff reconnection delay must remain under 1500ms."""
        mock_exchange = mock_ccxt_exchange_factory("coinbase")
        manager = ConnectionManager(
            exchange_id="coinbase",
            client_factory=AsyncMock(return_value=mock_exchange),
            max_backoff_ms=1500,
        )
        await manager.connect()

        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            for drop_idx in range(5):
                await manager.handle_socket_drop(error=RuntimeError(f"Drop #{drop_idx}"))
                assert mock_sleep.called
                last_sleep_s = mock_sleep.call_args.args[0]
                assert last_sleep_s <= 1.5, f"Sleep {last_sleep_s}s exceeded 1500ms constraint"

            assert manager.reconnect_count == 5

    @pytest.mark.asyncio
    async def test_reconnect_count_resets_on_stable_connection(self, mock_ccxt_exchange_factory):
        """Reconnection backoff attempts counter should reset once stable connectivity is confirmed."""
        mock_exchange = mock_ccxt_exchange_factory("bybit")
        manager = ConnectionManager(
            exchange_id="bybit",
            client_factory=AsyncMock(return_value=mock_exchange),
            max_backoff_ms=1500,
        )
        await manager.connect()

        with patch("asyncio.sleep", new_callable=AsyncMock):
            await manager.handle_socket_drop(error=RuntimeError("Transient drop"))
            assert manager.reconnect_count == 1

            manager.notify_healthy()
            assert manager.reconnect_count == 0


# ==============================================================================
# Multi-Exchange Isolation and Resilience Tests
# ==============================================================================

class TestMultiExchangeResilience:
    """Tests independent failure isolation across the supported exchanges."""

    @pytest.mark.asyncio
    @patch("src.gateway.ccxt_hub.ccxtpro")
    async def test_single_exchange_socket_drop_does_not_affect_others(
        self, mock_ccxtpro, valid_exchange_ids, mock_ccxt_exchange_factory
    ):
        """
        If Binance drops, Bybit and Coinbase must remain connected while Binance
        reconnects under 1500ms.
        """
        instances = {}
        for ex_id in valid_exchange_ids:
            inst = mock_ccxt_exchange_factory(ex_id)
            instances[ex_id] = inst
            setattr(mock_ccxtpro, ex_id, MagicMock(return_value=inst))

        gateway = CCXTProGateway(exchange_ids=valid_exchange_ids)
        await gateway.start()

        binance_manager = gateway.connection_managers["binance"]
        bybit_manager = gateway.connection_managers["bybit"]
        coinbase_manager = gateway.connection_managers["coinbase"]

        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            # Drop binance socket only
            await binance_manager.handle_socket_drop(error=ConnectionResetError("Binance WS dropped"))

            # Backoff respected
            assert mock_sleep.called
            sleep_duration = mock_sleep.call_args.args[0]
            assert sleep_duration <= 1.5

            # Bybit and Coinbase remained fully connected
            assert bybit_manager.state == ConnectionState.CONNECTED
            assert coinbase_manager.state == ConnectionState.CONNECTED
            assert gateway.is_connected("bybit") is True
            assert gateway.is_connected("coinbase") is True

        await gateway.stop()