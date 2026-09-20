"""Normalizer for incoming streaming exchange klines."""

import math
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List, Optional, Tuple, Union

from src.domain.models.candle import CandleRecord, PreciseDecimal


class KlineNormalizationError(Exception):
    """Raised when kline payload normalization fails due to invalid or malformed data."""


class KlineNormalizer:
    """Transforms raw exchange kline payloads into standardized CandleRecords."""

    def __init__(self, symbol: str = "") -> None:
        self.symbol: str = symbol
        self.processed_count: int = 0
        self.error_count: int = 0
        self.last_valid_timestamp: Optional[int] = None

    def normalize(self, payload: Any) -> CandleRecord:
        """Normalize raw dictionary or array kline payload into a CandleRecord."""
        try:
            record = self._parse_payload(payload)
        except KlineNormalizationError:
            self.error_count += 1
            raise
        except Exception as exc:
            self.error_count += 1
            raise KlineNormalizationError(f"Normalization failed: {exc}") from exc

        self.processed_count += 1
        self.last_valid_timestamp = record.timestamp
        self._publish_metric("kline_normalized", record=record)
        return record

    def _publish_metric(self, metric_name: str, *args: Any, **kwargs: Any) -> None:
        """Publish streaming normalization metrics (hook for monitoring systems)."""

    def _parse_payload(self, payload: Any) -> CandleRecord:
        if payload is None:
            raise KlineNormalizationError("Payload cannot be None")
        if isinstance(payload, dict):
            return self._parse_dict_payload(payload)
        if isinstance(payload, (list, tuple)):
            return self._parse_list_payload(payload)
        raise KlineNormalizationError(f"Unsupported payload type: {type(payload).__name__}")

    def _parse_dict_payload(self, payload: Dict[str, Any]) -> CandleRecord:
        data = payload.get("k") if isinstance(payload.get("k"), dict) else payload

        symbol = (
            data.get("symbol")
            or data.get("s")
            or payload.get("symbol")
            or payload.get("s")
            or self.symbol
        )
        if not symbol or not isinstance(symbol, str):
            raise KlineNormalizationError("Symbol could not be determined for kline frame")

        raw_ts = self._find_field(data, "timestamp", "time", "t", "T")
        if raw_ts is None:
            raise KlineNormalizationError("Missing timestamp in kline frame")
        timestamp = self._parse_timestamp(raw_ts)

        raw_open = self._find_field(data, "open", "o")
        raw_high = self._find_field(data, "high", "h")
        raw_low = self._find_field(data, "low", "l")
        raw_close = self._find_field(data, "close", "c")
        raw_volume = self._find_field(data, "volume", "vol", "v")

        if any(v is None for v in (raw_open, raw_high, raw_low, raw_close, raw_volume)):
            raise KlineNormalizationError("Missing one or more required OHLCV fields")

        open_d = self._parse_decimal(raw_open)
        high_d = self._parse_decimal(raw_high)
        low_d = self._parse_decimal(raw_low)
        close_d = self._parse_decimal(raw_close)
        volume_d = self._parse_decimal(raw_volume)

        is_closed = False
        raw_closed = self._find_field(data, "is_closed", "closed", "x")
        if raw_closed is not None:
            if isinstance(raw_closed, bool):
                is_closed = raw_closed
            elif isinstance(raw_closed, str):
                is_closed = raw_closed.strip().lower() in ("true", "1")
            else:
                is_closed = bool(raw_closed)

        return CandleRecord(
            symbol=symbol,
            timestamp=timestamp,
            open=open_d,
            high=high_d,
            low=low_d,
            close=close_d,
            volume=volume_d,
            is_closed=is_closed,
        )

    def _parse_list_payload(self, payload: Union[List[Any], Tuple[Any, ...]]) -> CandleRecord:
        if len(payload) < 6:
            raise KlineNormalizationError(
                f"Array payload requires at least 6 elements [timestamp, O, H, L, C, V], got {len(payload)}"
            )

        symbol = self.symbol
        if not symbol:
            raise KlineNormalizationError("Normalizer has no symbol configured for array payload")

        timestamp = self._parse_timestamp(payload[0])
        open_d = self._parse_decimal(payload[1])
        high_d = self._parse_decimal(payload[2])
        low_d = self._parse_decimal(payload[3])
        close_d = self._parse_decimal(payload[4])
        volume_d = self._parse_decimal(payload[5])

        is_closed = False
        if len(payload) > 6 and payload[6] is not None:
            raw_closed = payload[6]
            if isinstance(raw_closed, bool):
                is_closed = raw_closed
            elif isinstance(raw_closed, str):
                is_closed = raw_closed.strip().lower() in ("true", "1")
            else:
                is_closed = bool(raw_closed)

        return CandleRecord(
            symbol=symbol,
            timestamp=timestamp,
            open=open_d,
            high=high_d,
            low=low_d,
            close=close_d,
            volume=volume_d,
            is_closed=is_closed,
        )

    @staticmethod
    def _find_field(data: Dict[str, Any], *keys: str) -> Any:
        for k in keys:
            if k in data and data[k] is not None:
                return data[k]
        return None

    @staticmethod
    def _parse_timestamp(value: Any) -> int:
        if isinstance(value, bool) or value is None:
            raise KlineNormalizationError(f"Invalid timestamp value: {value!r}")
        if isinstance(value, int):
            return value
        if isinstance(value, str):
            val_str = value.strip()
            if not val_str:
                raise KlineNormalizationError("Timestamp string is empty")
            try:
                return int(val_str)
            except ValueError:
                try:
                    f = float(val_str)
                    if not math.isfinite(f):
                        raise KlineNormalizationError(f"Non-finite timestamp: {value!r}")
                    return int(f)
                except (ValueError, TypeError) as exc:
                    raise KlineNormalizationError(f"Invalid timestamp string: {value!r}") from exc
        if isinstance(value, float):
            if not math.isfinite(value):
                raise KlineNormalizationError(f"Non-finite timestamp: {value!r}")
            return int(value)
        if isinstance(value, Decimal):
            if not value.is_finite():
                raise KlineNormalizationError(f"Non-finite timestamp: {value!r}")
            return int(value)
        raise KlineNormalizationError(f"Unsupported timestamp type: {type(value)}")

    @staticmethod
    def _parse_decimal(value: Any) -> PreciseDecimal:
        if isinstance(value, bool) or value is None:
            raise KlineNormalizationError(f"Invalid numeric value: {value!r}")
        if isinstance(value, Decimal):
            if value.is_nan() or value.is_infinite():
                raise KlineNormalizationError(f"Decimal cannot be NaN or Infinite: {value!r}")
            return PreciseDecimal(value)
        if isinstance(value, (int, str)):
            try:
                val_str = str(value).strip()
                if not val_str:
                    raise KlineNormalizationError("Numeric string is empty")
                d = Decimal(val_str)
            except (InvalidOperation, TypeError, ValueError) as exc:
                raise KlineNormalizationError(f"Cannot parse decimal from {value!r}") from exc
            if d.is_nan() or d.is_infinite():
                raise KlineNormalizationError(f"Decimal cannot be NaN or Infinite: {value!r}")
            return PreciseDecimal(d)
        if isinstance(value, float):
            if not math.isfinite(value):
                raise KlineNormalizationError(f"Float cannot be NaN or Infinite: {value!r}")
            try:
                d = Decimal(str(value))
            except (InvalidOperation, TypeError, ValueError) as exc:
                raise KlineNormalizationError(f"Cannot parse float {value!r} to Decimal") from exc
            if d.is_nan() or d.is_infinite():
                raise KlineNormalizationError(f"Decimal cannot be NaN or Infinite: {value!r}")
            return PreciseDecimal(d)
        raise KlineNormalizationError(f"Unsupported type for decimal parsing: {type(value)}")