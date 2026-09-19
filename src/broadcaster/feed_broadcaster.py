"""Feed broadcaster responsible for routing market ticks to subscribed WebSocket clients within SLA."""

import asyncio
import inspect
import json
from typing import Any, Dict

from src.broadcaster.connection_manager import ConnectionManager


class FeedBroadcaster:
    """Dispatches serialized market events to subscribers within strict latency constraints."""

    def __init__(
        self,
        connection_manager: ConnectionManager,
        send_timeout_seconds: float = 0.005,
    ) -> None:
        self.connection_manager = connection_manager
        self.send_timeout_seconds = send_timeout_seconds

    async def broadcast_kline(
        self,
        symbol: str,
        timeframe: str,
        payload: Dict[str, Any],
    ) -> None:
        """Broadcast kline candle updates to subscribers of the matching symbol and timeframe."""
        topic = f"kline:{symbol}:{timeframe}"
        await self.broadcast(topic, payload)

    async def broadcast_trade(
        self,
        symbol: str,
        payload: Dict[str, Any],
    ) -> None:
        """Broadcast trade tick updates to subscribers of the matching symbol."""
        topic = f"trade:{symbol}"
        await self.broadcast(topic, payload)

    async def broadcast(self, topic: str, payload: Dict[str, Any]) -> None:
        """Route serialized payload concurrently to all subscribers of the topic."""
        subscribers = self.connection_manager.get_subscribers(topic)
        if not subscribers:
            return

        serialized = json.dumps(payload) if not isinstance(payload, str) else payload

        tasks = [self._send_to_client(ws, serialized) for ws in subscribers]
        await asyncio.gather(*tasks)

    async def _send_to_client(self, ws: Any, message: str) -> None:
        """Send message to a single client socket enforcing timeout and handling failures."""
        try:
            await asyncio.wait_for(ws.send_text(message), timeout=self.send_timeout_seconds)
        except Exception:
            self.connection_manager.remove_connection(ws)
            try:
                close_result = ws.close()
                if inspect.isawaitable(close_result):
                    await close_result
            except Exception:
                pass