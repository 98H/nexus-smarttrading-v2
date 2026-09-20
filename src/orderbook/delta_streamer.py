"""L2 Orderbook Delta Streamer with 100ms throttling and empty delta suppression."""

from __future__ import annotations

import asyncio
import inspect
import logging
import time
from typing import Any, Callable, Dict, List, Optional

from src.orderbook.models import (
    DeltaAction,
    LevelDelta,
    OrderBookDelta,
    RawL2Update,
    Side,
)

logger = logging.getLogger(__name__)


class L2DeltaStreamer:
    """
    Maintains internal orderbook state, coalesces high-frequency updates within
    throttled intervals, and streams differential updates to subscribers.
    """

    def __init__(
        self,
        symbol: str,
        throttle_interval_ms: int = 100,
        on_delta: Optional[Callable[[OrderBookDelta], Any]] = None,
    ) -> None:
        if throttle_interval_ms <= 0:
            raise ValueError(
                f"throttle_interval_ms must be strictly positive, got {throttle_interval_ms}"
            )

        self.symbol = symbol
        self.throttle_interval_ms = throttle_interval_ms
        self.on_delta = on_delta

        # Orderbook states mapped by price -> size
        self._committed_bids: Dict[float, float] = {}
        self._committed_asks: Dict[float, float] = {}
        self._current_bids: Dict[float, float] = {}
        self._current_asks: Dict[float, float] = {}

        self._latest_timestamp: Optional[int] = None
        self._is_running: bool = False
        self._task: Optional[asyncio.Task[None]] = None
        self._queues: List[asyncio.Queue[OrderBookDelta]] = []

    @property
    def is_running(self) -> bool:
        """Return True if background throttle loop is actively running."""
        return self._is_running and self._task is not None and not self._task.done()

    def get_delta_queue(self) -> asyncio.Queue[OrderBookDelta]:
        """Create and register an asyncio.Queue for downstream delta consumption."""
        queue: asyncio.Queue[OrderBookDelta] = asyncio.Queue()
        self._queues.append(queue)
        return queue

    def ingest_raw_update(self, update: RawL2Update) -> None:
        """
        Synchronously ingest raw price/size levels into current orderbook state.
        A size of 0 indicates level removal per CCXT conventions.
        """
        if update.symbol != self.symbol:
            raise ValueError(
                f"Symbol mismatch: streamer configured for '{self.symbol}', received '{update.symbol}'"
            )

        self._latest_timestamp = update.timestamp

        for item in update.bids:
            price, size = float(item[0]), float(item[1])
            if size == 0.0:
                self._current_bids.pop(price, None)
            else:
                self._current_bids[price] = size

        for item in update.asks:
            price, size = float(item[0]), float(item[1])
            if size == 0.0:
                self._current_asks.pop(price, None)
            else:
                self._current_asks[price] = size

    def compute_pending_delta(self, timestamp: Optional[int] = None) -> OrderBookDelta:
        """
        Calculate net differential changes between current state and last committed state.
        Updates internal committed state to current on completion.
        """
        bid_deltas: List[LevelDelta] = []
        ask_deltas: List[LevelDelta] = []

        # Differential calculations for bids
        for price, size in self._current_bids.items():
            if price not in self._committed_bids:
                bid_deltas.append(LevelDelta(Side.BID, DeltaAction.INSERT, price, size))
            elif size != self._committed_bids[price]:
                bid_deltas.append(LevelDelta(Side.BID, DeltaAction.UPDATE, price, size))

        for price in self._committed_bids:
            if price not in self._current_bids:
                bid_deltas.append(LevelDelta(Side.BID, DeltaAction.DELETE, price, 0.0))

        # Differential calculations for asks
        for price, size in self._current_asks.items():
            if price not in self._committed_asks:
                ask_deltas.append(LevelDelta(Side.ASK, DeltaAction.INSERT, price, size))
            elif size != self._committed_asks[price]:
                ask_deltas.append(LevelDelta(Side.ASK, DeltaAction.UPDATE, price, size))

        for price in self._committed_asks:
            if price not in self._current_asks:
                ask_deltas.append(LevelDelta(Side.ASK, DeltaAction.DELETE, price, 0.0))

        # Commit current orderbook state
        self._committed_bids = dict(self._current_bids)
        self._committed_asks = dict(self._current_asks)

        # Sort: bids descending price, asks ascending price
        bid_deltas.sort(key=lambda d: d.price, reverse=True)
        ask_deltas.sort(key=lambda d: d.price, reverse=False)

        ts = (
            timestamp
            if timestamp is not None
            else (
                self._latest_timestamp
                if self._latest_timestamp is not None
                else int(time.time() * 1000)
            )
        )

        return OrderBookDelta(
            symbol=self.symbol,
            timestamp=ts,
            bids=bid_deltas,
            asks=ask_deltas,
        )

    async def push_update(self, update: RawL2Update) -> None:
        """Asynchronously push raw L2 update."""
        self.ingest_raw_update(update)

    async def push_ccxt_update(self, ccxt_payload: dict[str, Any]) -> None:
        """Adapt and push standard CCXT orderbook payload dict."""
        symbol = ccxt_payload.get("symbol", self.symbol)
        timestamp = ccxt_payload.get("timestamp") or int(time.time() * 1000)
        bids = ccxt_payload.get("bids", [])
        asks = ccxt_payload.get("asks", [])

        raw = RawL2Update(
            symbol=symbol,
            timestamp=timestamp,
            bids=bids,
            asks=asks,
        )
        await self.push_update(raw)

    async def start(self) -> None:
        """Start background throttle timer loop idempotently."""
        if self._is_running:
            return
        self._is_running = True
        self._task = asyncio.create_task(self._run_throttle_loop())

    async def stop(self) -> None:
        """Gracefully stop background loop and cancel active tasks."""
        if not self._is_running and self._task is None:
            return
        self._is_running = False
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _emit_delta(self, delta: OrderBookDelta) -> None:
        """Emit delta to consumer callback and registered queues."""
        if self.on_delta is not None:
            try:
                result = self.on_delta(delta)
                if inspect.isawaitable(result):
                    await result
            except Exception:
                logger.exception("Error executing on_delta downstream callback")

        for queue in self._queues:
            try:
                queue.put_nowait(delta)
            except Exception:
                logger.exception("Error enqueuing delta to subscriber queue")

    async def _run_throttle_loop(self) -> None:
        """Throttling loop executing at configured intervals."""
        interval_sec = self.throttle_interval_ms / 1000.0
        loop = asyncio.get_running_loop()
        next_tick = loop.time() + interval_sec

        try:
            while self._is_running:
                sleep_duration = max(0.0, next_tick - loop.time())
                await asyncio.sleep(sleep_duration)
                next_tick += interval_sec
                if loop.time() > next_tick:
                    next_tick = loop.time() + interval_sec

                delta = self.compute_pending_delta()
                # Suppress emission when delta has no differential changes
                if not delta.is_empty:
                    await self._emit_delta(delta)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Unexpected error in delta streamer throttle loop")
            self._is_running = False