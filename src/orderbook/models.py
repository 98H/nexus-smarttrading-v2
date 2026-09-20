"""Domain models for L2 orderbook deltas and CCXT updates."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Sequence, Tuple, Union


class Side(str, Enum):
    """Side of the orderbook."""

    BID = "BID"
    ASK = "ASK"


class DeltaAction(str, Enum):
    """Differential action to be applied to an orderbook level."""

    INSERT = "INSERT"
    UPDATE = "UPDATE"
    DELETE = "DELETE"


@dataclass(frozen=True)
class LevelDelta:
    """Represents a delta update for a single price/size level."""

    side: Side
    action: DeltaAction
    price: float
    size: float

    def __post_init__(self) -> None:
        if not isinstance(self.side, Side):
            object.__setattr__(self, "side", Side(self.side))
        if not isinstance(self.action, DeltaAction):
            object.__setattr__(self, "action", DeltaAction(self.action))
        if self.price <= 0:
            raise ValueError(f"Price must be strictly positive, got {self.price}")
        if self.size < 0:
            raise ValueError(f"Size must be non-negative, got {self.size}")


@dataclass
class OrderBookDelta:
    """Differential orderbook update containing modified bid/ask levels."""

    symbol: str
    timestamp: int
    bids: list[LevelDelta] = field(default_factory=list)
    asks: list[LevelDelta] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        """Indicate whether the delta contains any level modifications."""
        return len(self.bids) == 0 and len(self.asks) == 0


@dataclass
class RawL2Update:
    """Raw CCXT L2 depth update structure."""

    symbol: str
    timestamp: int
    bids: Sequence[Union[Tuple[float, float], list[float], Any]] = field(default_factory=list)
    asks: Sequence[Union[Tuple[float, float], list[float], Any]] = field(default_factory=list)