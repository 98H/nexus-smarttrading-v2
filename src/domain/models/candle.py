"""Domain model representing a normalized OHLCV candlestick record."""

from dataclasses import dataclass
from decimal import Decimal


class PreciseDecimal(Decimal):
    """Arbitrary-precision Decimal that preserves exact representation without scientific notation."""

    def __str__(self) -> str:
        if self.is_nan() or self.is_infinite():
            return super().__str__()
        return format(self, "f")

    def __format__(self, format_spec: str) -> str:
        if not format_spec:
            return str(self)
        return super().__format__(format_spec)


@dataclass(frozen=True)
class CandleRecord:
    """Normalized OHLCV candlestick frame using arbitrary-precision Decimals."""

    symbol: str
    timestamp: int
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    is_closed: bool = False

    def __post_init__(self) -> None:
        if not isinstance(self.symbol, str):
            object.__setattr__(self, "symbol", str(self.symbol))

        if isinstance(self.timestamp, bool) or not isinstance(self.timestamp, int):
            try:
                object.__setattr__(self, "timestamp", int(self.timestamp))
            except (TypeError, ValueError) as exc:
                raise TypeError(f"Invalid timestamp: {self.timestamp!r}") from exc

        for field_name in ("open", "high", "low", "close", "volume"):
            val = getattr(self, field_name)
            if not isinstance(val, PreciseDecimal):
                if isinstance(val, float):
                    dec_val = Decimal(str(val))
                elif isinstance(val, Decimal):
                    dec_val = val
                else:
                    dec_val = Decimal(str(val))
                object.__setattr__(self, field_name, PreciseDecimal(dec_val))

        if not isinstance(self.is_closed, bool):
            object.__setattr__(self, "is_closed", bool(self.is_closed))