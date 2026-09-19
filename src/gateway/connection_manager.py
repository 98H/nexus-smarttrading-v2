"""Connection manager and backoff strategy for exchange WebSocket gateways."""

import asyncio
from enum import Enum
import inspect
import logging
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)


class ConnectionState(Enum):
    """WebSocket connection state."""
    DISCONNECTED = "DISCONNECTED"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    RECONNECTING = "RECONNECTING"


class BackoffStrategy:
    """Calculates reconnection backoff delays with an upper ceiling."""

    def __init__(
        self,
        initial_delay_ms: float = 100.0,
        max_delay_ms: float = 1500.0,
        factor: float = 2.0,
        jitter: bool = False,
    ) -> None:
        if max_delay_ms > 1500.0:
            raise ValueError(
                f"max_delay_ms cannot exceed 1500ms constraint (got {max_delay_ms})"
            )
        if initial_delay_ms <= 0:
            raise ValueError("initial_delay_ms must be positive")
        if max_delay_ms <= 0:
            raise ValueError("max_delay_ms must be positive")
        if initial_delay_ms > max_delay_ms:
            raise ValueError("initial_delay_ms cannot exceed max_delay_ms")
        if factor < 1.0:
            raise ValueError("factor must be >= 1.0")

        self.initial_delay_ms = initial_delay_ms
        self.max_delay_ms = max_delay_ms
        self.factor = factor
        self.jitter = jitter

    def calculate_delay_ms(self, attempt: int) -> float:
        """Calculate reconnection delay for a given attempt index (1-based)."""
        if attempt < 1:
            attempt = 1
        delay = self.initial_delay_ms * (self.factor ** (attempt - 1))
        delay = min(delay, float(self.max_delay_ms))
        if self.jitter:
            import random
            delay = random.uniform(0.5 * delay, delay)

        if (
            isinstance(self.initial_delay_ms, int)
            and isinstance(self.max_delay_ms, int)
            and delay == int(delay)
        ):
            return int(delay)
        return delay


class ConnectionManager:
    """Manages connection state, auto-reconnection, and lifecycle for an exchange."""

    def __init__(
        self,
        exchange_id: str,
        client_factory: Optional[Callable[[], Any]] = None,
        max_backoff_ms: float = 1500.0,
        initial_backoff_ms: float = 100.0,
        backoff_strategy: Optional[BackoffStrategy] = None,
    ) -> None:
        self.exchange_id = exchange_id
        self.client_factory = client_factory
        if backoff_strategy is not None:
            self.backoff_strategy = backoff_strategy
        else:
            self.backoff_strategy = BackoffStrategy(
                initial_delay_ms=initial_backoff_ms,
                max_delay_ms=max_backoff_ms,
                factor=2.0,
                jitter=False,
            )
        self.state = ConnectionState.DISCONNECTED
        self.reconnect_count = 0
        self.client: Any = None

    @property
    def is_connected(self) -> bool:
        """Return True if connection is currently active and healthy."""
        if self.state != ConnectionState.CONNECTED:
            return False
        if self.client is not None and hasattr(self.client, "is_connected"):
            client_conn = getattr(self.client, "is_connected")
            if callable(client_conn):
                return bool(client_conn())
            return bool(client_conn)
        return True

    async def connect(self) -> Any:
        """Establish or re-establish connection using client_factory."""
        self.state = ConnectionState.CONNECTING
        try:
            if self.client_factory is not None:
                client_res = self.client_factory()
                if inspect.isawaitable(client_res):
                    self.client = await client_res
                else:
                    self.client = client_res
            self.state = ConnectionState.CONNECTED
            return self.client
        except Exception:
            self.state = ConnectionState.DISCONNECTED
            raise

    async def disconnect(self) -> None:
        """Close connection and reset state to DISCONNECTED."""
        if self.client is not None:
            if hasattr(self.client, "close"):
                close_fn = getattr(self.client, "close")
                if callable(close_fn):
                    res = close_fn()
                    if inspect.isawaitable(res):
                        await res
        self.state = ConnectionState.DISCONNECTED

    async def handle_socket_drop(self, error: Optional[Exception] = None) -> None:
        """Handle socket drop: transition to DISCONNECTED, backoff sleep, and reconnect."""
        logger.warning(
            "Socket dropped for exchange '%s': %s. Initiating reconnection.",
            self.exchange_id,
            error,
        )
        self.state = ConnectionState.DISCONNECTED
        self.reconnect_count += 1
        delay_ms = self.backoff_strategy.calculate_delay_ms(self.reconnect_count)
        await asyncio.sleep(delay_ms / 1000.0)
        await self.connect()

    def notify_healthy(self) -> None:
        """Reset reconnection backoff counter upon confirmation of stable connection."""
        self.reconnect_count = 0