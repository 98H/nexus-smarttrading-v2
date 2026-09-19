"""CCXT Pro Multi-Exchange Connection Gateway and Hub."""

import asyncio
import logging
from typing import Any, Sequence

try:
    import ccxt.pro as ccxtpro  # type: ignore
except ImportError:
    try:
        import ccxtpro  # type: ignore
    except ImportError:
        ccxtpro = None  # type: ignore

from src.gateway.connection_manager import (
    ConnectionManager,
    ConnectionState,
)

logger = logging.getLogger(__name__)

SUPPORTED_EXCHANGE_IDS = {"binance", "bybit", "coinbase"}


class CCXTProGateway:
    """Gateway orchestrating persistent WebSocket connections across multiple CCXT Pro exchanges."""

    def __init__(
        self,
        exchange_ids: Sequence[str],
        max_backoff_ms: float = 1500.0,
    ) -> None:
        if not exchange_ids:
            raise ValueError("exchange_ids list cannot be empty.")

        for ex_id in exchange_ids:
            is_valid = ex_id in SUPPORTED_EXCHANGE_IDS or (
                ccxtpro is not None and hasattr(ccxtpro, ex_id)
            )
            if not is_valid:
                raise ValueError(f"Unsupported exchange ID: '{ex_id}'")

        self.exchange_ids = list(exchange_ids)
        self.max_backoff_ms = max_backoff_ms
        self.connection_managers: dict[str, ConnectionManager] = {}

        for ex_id in self.exchange_ids:
            self.connection_managers[ex_id] = ConnectionManager(
                exchange_id=ex_id,
                client_factory=self._make_client_factory(ex_id),
                max_backoff_ms=self.max_backoff_ms,
            )

    def _make_client_factory(self, exchange_id: str):
        """Construct asynchronous factory returning an initialized CCXT Pro client."""
        async def _factory() -> Any:
            if ccxtpro is None or not hasattr(ccxtpro, exchange_id):
                raise ValueError(f"Exchange '{exchange_id}' is not available in ccxtpro.")
            exchange_class = getattr(ccxtpro, exchange_id)
            client = exchange_class()
            return client
        return _factory

    def is_connected(self, exchange_id: str) -> bool:
        """Check if WebSocket connection for exchange_id is active and healthy."""
        manager = self.connection_managers.get(exchange_id)
        if manager is None:
            return False
        return manager.is_connected

    async def start(self) -> None:
        """Establish persistent WebSocket connections for all configured exchanges."""
        tasks = [
            manager.connect()
            for manager in self.connection_managers.values()
            if manager.state != ConnectionState.CONNECTED
        ]
        if tasks:
            await asyncio.gather(*tasks)

    async def stop(self) -> None:
        """Gracefully close all WebSocket connections across all exchanges."""
        tasks = [
            manager.disconnect()
            for manager in self.connection_managers.values()
        ]
        if tasks:
            await asyncio.gather(*tasks)

    async def __aenter__(self) -> "CCXTProGateway":
        await self.start()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        await self.stop()


CCXTHub = CCXTProGateway