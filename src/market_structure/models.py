from dataclasses import dataclass
from datetime import datetime
from enum import Enum


class PivotType(str, Enum):
    HIGH = "HIGH"
    LOW = "LOW"


class StructureLevel(str, Enum):
    SWING = "SWING"
    INTERNAL = "INTERNAL"


class StructureType(str, Enum):
    BOS = "BOS"
    CHOCH = "CHOCH"


class TrendDirection(str, Enum):
    UPTREND = "UPTREND"
    DOWNTREND = "DOWNTREND"


@dataclass(frozen=True)
class Bar:
    index: int
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float = 0.0

    def __post_init__(self) -> None:
        if self.index < 0:
            raise ValueError(f"Bar index must be non-negative, got {self.index}")
        if self.high < self.low:
            raise ValueError(f"Bar high ({self.high}) cannot be less than low ({self.low})")
        if self.high < self.open:
            raise ValueError(f"Bar high ({self.high}) cannot be less than open ({self.open})")
        if self.high < self.close:
            raise ValueError(f"Bar high ({self.high}) cannot be less than close ({self.close})")
        if self.low > self.open:
            raise ValueError(f"Bar low ({self.low}) cannot be greater than open ({self.open})")
        if self.low > self.close:
            raise ValueError(f"Bar low ({self.low}) cannot be greater than close ({self.close})")


@dataclass(frozen=True)
class Pivot:
    index: int
    price: float
    timestamp: datetime
    pivot_type: PivotType
    level: StructureLevel = StructureLevel.SWING

    def __post_init__(self) -> None:
        if self.index < 0:
            raise ValueError(f"Pivot index must be non-negative, got {self.index}")
        if self.price < 0:
            raise ValueError(f"Pivot price must be non-negative, got {self.price}")


@dataclass(frozen=True)
class StructureEvent:
    event_type: StructureType
    level: StructureLevel
    direction: TrendDirection
    broken_pivot_index: int
    broken_pivot_price: float
    timestamp: datetime
    bar_index: int
    trigger_price: float