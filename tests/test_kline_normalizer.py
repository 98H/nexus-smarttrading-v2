import asyncio
from decimal import Decimal
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.domain.models.candle import CandleRecord
from src.streaming.kline_normalizer import (
    KlineNormalizationError,
    KlineNormalizer,
)


@pytest.fixture
def sample_valid_dict_payload() -> Dict[str, Any]:
    """Sample raw exchange dictionary kline payload with string prices/volume."""
    return {
        "symbol": "BTC/USDT",
        "timestamp": 1672531199000,
        "open": "16543.123456789012345678",
        "high": "16550.987654321098765432",
        "low": "16540.000000000000000001",
        "close": "16548.555555555555555555",
        "volume": "123.456789012345678901",
        "is_closed": True,
    }


@pytest.fixture
def sample_valid_list_payload() -> List[Any]:
    """Sample raw exchange list kline payload (e.g., [timestamp, O, H, L, C, V])."""
    return [
        1672531200000,
        "16548.555555555555555555",
        "16560.111111111111111111",
        "16545.222222222222222222",
        "16555.333333333333333333",
        "45.678901234567890123",
    ]


@pytest.fixture
def normalizer() -> KlineNormalizer:
    """Instance of KlineNormalizer configured for a standard symbol."""
    return KlineNormalizer(symbol="BTC/USDT")


# =====================================================================
# Domain Model Tests: CandleRecord
# =====================================================================


def test_candle_record_schema_and_types():
    """Verify CandleRecord initializes with arbitrary-precision Decimal values."""
    record = CandleRecord(
        symbol="BTC/USDT",
        timestamp=1672531199000,
        open=Decimal("16543.123456789012345678"),
        high=Decimal("16550.987654321098765432"),
        low=Decimal("16540.000000000000000001"),
        close=Decimal("16548.555555555555555555"),
        volume=Decimal("123.456789012345678901"),
        is_closed=True,
    )

    assert record.symbol == "BTC/USDT"
    assert record.timestamp == 1672531199000
    assert isinstance(record.open, Decimal)
    assert isinstance(record.high, Decimal)
    assert isinstance(record.low, Decimal)
    assert isinstance(record.close, Decimal)
    assert isinstance(record.volume, Decimal)
    assert record.is_closed is True


def test_candle_record_precision_preservation():
    """Ensure floating-point arithmetic inaccuracies are completely avoided in CandleRecord."""
    precise_str = "0.000000000000000001"
    record = CandleRecord(
        symbol="SATS/USDT",
        timestamp=1672531199000,
        open=Decimal(precise_str),
        high=Decimal(precise_str),
        low=Decimal(precise_str),
        close=Decimal(precise_str),
        volume=Decimal("100000000.000000000000000000"),
        is_closed=False,
    )

    assert str(record.open) == precise_str
    assert record.open != 0.0
    assert record.open == Decimal(precise_str)


# =====================================================================
# KlineNormalizer Tests: Normalization & Precision
# =====================================================================


def test_normalize_dict_payload_success(normalizer, sample_valid_dict_payload):
    """Given a raw dict frame, verify it transforms into a CandleRecord with Decimal fields."""
    record = normalizer.normalize(sample_valid_dict_payload)

    assert isinstance(record, CandleRecord)
    assert record.symbol == "BTC/USDT"
    assert record.timestamp == 1672531199000
    assert record.open == Decimal("16543.123456789012345678")
    assert record.high == Decimal("16550.987654321098765432")
    assert record.low == Decimal("16540.000000000000000001")
    assert record.close == Decimal("16548.555555555555555555")
    assert record.volume == Decimal("123.456789012345678901")
    assert record.is_closed is True


def test_normalize_list_payload_success(normalizer, sample_valid_list_payload):
    """Given a raw list/array frame, verify it transforms into a standard CandleRecord."""
    record = normalizer.normalize(sample_valid_list_payload)

    assert isinstance(record, CandleRecord)
    assert record.symbol == "BTC/USDT"
    assert record.timestamp == 1672531200000
    assert record.open == Decimal("16548.555555555555555555")
    assert record.high == Decimal("16560.111111111111111111")
    assert record.low == Decimal("16545.222222222222222222")
    assert record.close == Decimal("16555.333333333333333333")
    assert record.volume == Decimal("45.678901234567890123")


def test_normalize_variable_numeric_representations(normalizer):
    """Verify normalizer handles variable formats (integers, scientific strings) without float loss."""
    raw_payload = {
        "symbol": "BTC/USDT",
        "timestamp": 1672531199000,
        "open": 16000,  # Integer
        "high": "1.65e4",  # Scientific notation string
        "low": "15999.000000000000000000000001",  # Extended arbitrary precision
        "close": 16100.5,  # Numeric float/decimal representation
        "volume": "1000",
    }

    record = normalizer.normalize(raw_payload)

    assert isinstance(record.open, Decimal)
    assert record.open == Decimal("16000")
    assert isinstance(record.high, Decimal)
    assert record.high == Decimal("16500")
    assert isinstance(record.low, Decimal)
    assert record.low == Decimal("15999.000000000000000000000001")
    assert isinstance(record.close, Decimal)
    assert record.close == Decimal("16100.5")


# =====================================================================
# KlineNormalizer Tests: Malformed Payloads & State Preservation
# =====================================================================


@pytest.mark.parametrize(
    "malformed_payload",
    [
        {},  # Empty frame
        {"symbol": "BTC/USDT"},  # Missing OHLCV fields
        {"symbol": "BTC/USDT", "open": "invalid_num"},  # Non-numeric string
        {"timestamp": "not_an_int"},  # Corrupted timestamp
        [1672531200000, "100.0"],  # Incomplete array payload
        "malformed_string_frame",  # Incompatible type
        None,  # Null payload
    ],
)
def test_normalize_malformed_payload_raises_normalization_error(normalizer, malformed_payload):
    """Ensure KlineNormalizationError is raised for invalid payloads without dropping normalizer."""
    with pytest.raises(KlineNormalizationError):
        normalizer.normalize(malformed_payload)


def test_normalizer_preserves_state_after_error(normalizer, sample_valid_dict_payload):
    """Verify stream state (e.g., sequence counter, tracking) is preserved after encountering errors."""
    # Process first valid payload
    first_record = normalizer.normalize(sample_valid_dict_payload)
    assert first_record is not None
    assert normalizer.processed_count == 1
    assert normalizer.last_valid_timestamp == 1672531199000

    # Inject malformed frames
    with pytest.raises(KlineNormalizationError):
        normalizer.normalize({"corrupted": "data"})

    with pytest.raises(KlineNormalizationError):
        normalizer.normalize([123])

    # State must not be reset or dropped
    assert normalizer.processed_count == 1
    assert normalizer.last_valid_timestamp == 1672531199000
    assert normalizer.error_count == 2

    # Subsequent valid frame should process cleanly with updated state
    next_payload = sample_valid_dict_payload.copy()
    next_payload["timestamp"] = 1672531259000
    next_payload["close"] = "16599.99"

    second_record = normalizer.normalize(next_payload)
    assert second_record.timestamp == 1672531259000
    assert second_record.close == Decimal("16599.99")
    assert normalizer.processed_count == 2
    assert normalizer.last_valid_timestamp == 1672531259000


# =====================================================================
# Async & Streaming Integration Tests
# =====================================================================


@pytest.mark.asyncio
async def test_async_stream_processing_and_error_handling(normalizer, sample_valid_dict_payload):
    """Verify asynchronous stream ingestion processes valid frames and handles errors in-stream."""
    mock_stream_source = AsyncMock()

    malformed_frame = {"bad": "frame"}
    valid_frame_2 = sample_valid_dict_payload.copy()
    valid_frame_2["timestamp"] = 1672531260000

    # Simulate an incoming stream containing: Valid -> Invalid -> Valid
    mock_stream_source.__aiter__.return_value = [
        sample_valid_dict_payload,
        malformed_frame,
        valid_frame_2,
    ]

    emitted_records: List[CandleRecord] = []
    caught_errors: List[KlineNormalizationError] = []

    async for raw_frame in mock_stream_source:
        try:
            record = normalizer.normalize(raw_frame)
            emitted_records.append(record)
        except KlineNormalizationError as err:
            caught_errors.append(err)

    assert len(emitted_records) == 2
    assert len(caught_errors) == 1
    assert emitted_records[0].timestamp == 1672531199000
    assert emitted_records[1].timestamp == 1672531260000
    assert normalizer.processed_count == 2
    assert normalizer.error_count == 1


@patch("src.streaming.kline_normalizer.KlineNormalizer._publish_metric", MagicMock())
def test_normalizer_metric_emission_offline_mock(normalizer, sample_valid_dict_payload):
    """Verify metrics/monitoring calls are executed without requiring live daemons."""
    normalizer.normalize(sample_valid_dict_payload)
    normalizer._publish_metric.assert_called_once()