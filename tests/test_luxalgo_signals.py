"""
Unit tests for LuxAlgo Dynamic Confirmation & Contrarian Signal Generator.

Specification:
- Requirement: Story 3.1.1: LuxAlgo Dynamic Confirmation & Contrarian Signal Generator
- Acceptance Criteria:
  1. Given historical close prices and average true range (ATR) series,
     When the signal generation algorithm executes,
     Then confirmed trend Buy and Sell signal arrays are produced matching reference threshold conditions.
  2. Given historical price extremes and dynamic ATR boundary levels,
     When reversal/exhaustion conditions are evaluated,
     Then contrarian signal indices are generated and differentiated from confirmation signals.

Target Modules:
- src/signals/luxalgo_signals.py
- src/signals/__init__.py
"""

from typing import Tuple
import numpy as np
import pandas as pd
import pytest

from src.signals import (
    ConfirmationThresholdConfig,
    ContrarianBoundaryConfig,
    LuxAlgoSignalGenerator,
    LuxAlgoSignals,
    SignalType,
)
from src.signals.luxalgo_signals import (
    ConfirmationThresholdConfig as DirectConfirmationConfig,
    ContrarianBoundaryConfig as DirectContrarianConfig,
    LuxAlgoSignalGenerator as DirectLuxAlgoSignalGenerator,
    LuxAlgoSignals as DirectLuxAlgoSignals,
    SignalType as DirectSignalType,
)


# ============================================================================
# Test Fixtures & Deterministic Market Data Builders
# ============================================================================

@pytest.fixture
def base_configs() -> Tuple[ConfirmationThresholdConfig, ContrarianBoundaryConfig]:
    """Default configurations for confirmation and contrarian generators."""
    conf_config = ConfirmationThresholdConfig(
        trend_threshold_multiplier=1.5,
        min_trend_bars=3,
    )
    contrarian_config = ContrarianBoundaryConfig(
        exhaustion_multiplier=2.0,
        reversal_lookback=2,
    )
    return conf_config, contrarian_config


@pytest.fixture
def generator(base_configs: Tuple[ConfirmationThresholdConfig, ContrarianBoundaryConfig]) -> LuxAlgoSignalGenerator:
    """Initialized LuxAlgoSignalGenerator instance with default configs."""
    conf_config, contrarian_config = base_configs
    return LuxAlgoSignalGenerator(
        confirmation_config=conf_config,
        contrarian_config=contrarian_config,
    )


@pytest.fixture
def synthetic_market_data() -> pd.DataFrame:
    """
    Constructs a deterministic 60-bar OHLCV + ATR market dataset containing:
    - Bars 0..19: Sustained uptrend (should trigger confirmation Buy).
    - Bars 20..24: Bull exhaustion blow-off top exceeding dynamic upper ATR band
                   with immediate bearish reversal (should trigger contrarian Sell).
    - Bars 25..44: Sustained downtrend (should trigger confirmation Sell).
    - Bars 45..49: Capitulation bottom piercing dynamic lower ATR band
                   with immediate bullish reversal (should trigger contrarian Buy).
    - Bars 50..59: Flat consolidation (no signals).
    """
    length = 60
    close = np.zeros(length, dtype=np.float64)
    high = np.zeros(length, dtype=np.float64)
    low = np.zeros(length, dtype=np.float64)
    atr = np.full(length, 2.0, dtype=np.float64)

    # 1. Steady Uptrend (0..19)
    # Price advances smoothly: +1.5 per bar, ATR=2.0
    for i in range(20):
        c = 100.0 + (i * 1.5)
        close[i] = c
        high[i] = c + 1.0
        low[i] = c - 1.0

    # 2. Bull Exhaustion & Reversal (20..24)
    # Bar 20: Climax spike way above upper dynamic ATR boundary
    close[20] = 135.0
    high[20] = 142.0  # Spike well beyond upper ATR band
    low[20] = 129.0

    # Bar 21: Sharp reversal downwards
    close[21] = 127.0
    high[21] = 134.0
    low[21] = 126.0

    # Bars 22-24: Continuation down into trend transition
    for idx, i in enumerate(range(22, 25), start=1):
        close[i] = 127.0 - (idx * 2.0)
        high[i] = close[i] + 1.0
        low[i] = close[i] - 1.0

    # 3. Steady Downtrend (25..44)
    # Price falls steadily: -1.5 per bar
    base_dt = close[24]
    for idx, i in enumerate(range(25, 45), start=1):
        c = base_dt - (idx * 1.5)
        close[i] = c
        high[i] = c + 1.0
        low[i] = c - 1.0

    # 4. Capitulation Bottom & Reversal (45..49)
    # Bar 45: Panic dump piercing lower ATR boundary
    close[45] = 80.0
    high[45] = 86.0
    low[45] = 70.0  # Extreme low piercing lower band
    atr[45] = 3.0

    # Bar 46: Strong bullish rejection rebound
    close[46] = 88.0
    high[46] = 89.0
    low[46] = 81.0

    # Bars 47-49: Rebound consolidation
    for idx, i in enumerate(range(47, 50), start=1):
        close[i] = 88.0 + (idx * 0.5)
        high[i] = close[i] + 0.8
        low[i] = close[i] - 0.8

    # 5. Consolidation / Flat (50..59)
    for i in range(50, 60):
        close[i] = 90.0
        high[i] = 90.5
        low[i] = 89.5
        atr[i] = 1.0

    df = pd.DataFrame(
        {
            "close": close,
            "high": high,
            "low": low,
            "atr": atr,
        }
    )
    return df


# ============================================================================
# Package Export & Interface Tests
# ============================================================================

def test_module_exports_consistency():
    """Verify that public classes and types are exported identically from __init__."""
    assert LuxAlgoSignalGenerator is DirectLuxAlgoSignalGenerator
    assert LuxAlgoSignals is DirectLuxAlgoSignals
    assert ConfirmationThresholdConfig is DirectConfirmationConfig
    assert ContrarianBoundaryConfig is DirectContrarianConfig
    assert SignalType is DirectSignalType


def test_signal_type_enum_members():
    """Verify standard signal type classifications exist."""
    assert SignalType.CONFIRMATION_BUY is not None
    assert SignalType.CONFIRMATION_SELL is not None
    assert SignalType.CONTRARIAN_BUY is not None
    assert SignalType.CONTRARIAN_SELL is not None
    assert SignalType.NEUTRAL is not None


# ============================================================================
# Acceptance Criteria 1: Dynamic Confirmation Signals
# ============================================================================

def test_confirmation_signals_generated_as_boolean_or_binary_arrays(
    generator: LuxAlgoSignalGenerator,
    synthetic_market_data: pd.DataFrame,
):
    """
    Given historical close prices and ATR series,
    When confirmation signal generator executes,
    Then boolean/binary confirmation buy and sell arrays are returned with matching length.
    """
    signals = generator.generate_confirmation_signals(
        close=synthetic_market_data["close"],
        atr=synthetic_market_data["atr"],
    )

    assert hasattr(signals, "buy")
    assert hasattr(signals, "sell")
    assert len(signals.buy) == len(synthetic_market_data)
    assert len(signals.sell) == len(synthetic_market_data)
    assert isinstance(signals.buy, (np.ndarray, pd.Series))
    assert isinstance(signals.sell, (np.ndarray, pd.Series))
    assert signals.buy.dtype == bool
    assert signals.sell.dtype == bool


def test_confirmation_signals_identify_sustained_uptrend_and_downtrend(
    generator: LuxAlgoSignalGenerator,
    synthetic_market_data: pd.DataFrame,
):
    """
    Given strong trend regimes matching threshold multiplier conditions,
    When confirmation signals are evaluated,
    Then Buy signals trigger during uptrend (bars 5..19) and Sell signals during downtrend (bars 28..44).
    """
    signals = generator.generate_confirmation_signals(
        close=synthetic_market_data["close"],
        atr=synthetic_market_data["atr"],
    )

    # During steady uptrend, confirmation buy should be active
    uptrend_slice = signals.buy[5:19]
    assert np.any(uptrend_slice), "Expected confirmation buy signals during steady uptrend"
    assert not np.any(signals.sell[5:19]), "No confirmation sell signals during uptrend"

    # During steady downtrend, confirmation sell should be active
    downtrend_slice = signals.sell[28:44]
    assert np.any(downtrend_slice), "Expected confirmation sell signals during steady downtrend"
    assert not np.any(signals.buy[28:44]), "No confirmation buy signals during downtrend"


def test_confirmation_signals_suppressed_in_flat_market(
    generator: LuxAlgoSignalGenerator,
    synthetic_market_data: pd.DataFrame,
):
    """
    Given low volatility and flat prices below threshold conditions,
    When confirmation signals are evaluated,
    Then neither Buy nor Sell signals are triggered.
    """
    signals = generator.generate_confirmation_signals(
        close=synthetic_market_data["close"],
        atr=synthetic_market_data["atr"],
    )

    flat_buy_slice = signals.buy[50:60]
    flat_sell_slice = signals.sell[50:60]

    assert not np.any(flat_buy_slice), "Flat market should not trigger confirmation buy"
    assert not np.any(flat_sell_slice), "Flat market should not trigger confirmation sell"


def test_confirmation_signals_threshold_sensitivity():
    """
    Given an identical market dataset,
    When threshold multiplier is increased,
    Then the number of triggered confirmation signals strictly decreases or remains equal.
    """
    close = pd.Series(100.0 + np.cumsum(np.random.RandomState(42).normal(1.0, 0.5, 50)))
    atr = pd.Series(np.full(50, 1.5))

    low_threshold_gen = LuxAlgoSignalGenerator(
        confirmation_config=ConfirmationThresholdConfig(trend_threshold_multiplier=1.0)
    )
    high_threshold_gen = LuxAlgoSignalGenerator(
        confirmation_config=ConfirmationThresholdConfig(trend_threshold_multiplier=3.0)
    )

    signals_low = low_threshold_gen.generate_confirmation_signals(close=close, atr=atr)
    signals_high = high_threshold_gen.generate_confirmation_signals(close=close, atr=atr)

    assert int(np.sum(signals_high.buy)) <= int(np.sum(signals_low.buy))
    assert int(np.sum(signals_high.sell)) <= int(np.sum(signals_low.sell))


# ============================================================================
# Acceptance Criteria 2: Contrarian Signals & Differentiation
# ============================================================================

def test_contrarian_signals_generated_at_exhaustion_reversals(
    generator: LuxAlgoSignalGenerator,
    synthetic_market_data: pd.DataFrame,
):
    """
    Given price extremes exceeding dynamic ATR boundary levels and reversing,
    When contrarian reversal conditions are evaluated,
    Then contrarian Sell is triggered near the top (20..22) and contrarian Buy near the bottom (45..47).
    """
    contrarian = generator.generate_contrarian_signals(
        high=synthetic_market_data["high"],
        low=synthetic_market_data["low"],
        close=synthetic_market_data["close"],
        atr=synthetic_market_data["atr"],
    )

    assert hasattr(contrarian, "buy")
    assert hasattr(contrarian, "sell")
    assert hasattr(contrarian, "upper_boundary")
    assert hasattr(contrarian, "lower_boundary")

    # Blow-off top at bar 20-21 should trigger contrarian sell
    assert np.any(contrarian.sell[20:23]), "Expected contrarian sell trigger at exhaustion top"

    # Capitulation bottom at bar 45-47 should trigger contrarian buy
    assert np.any(contrarian.buy[45:48]), "Expected contrarian buy trigger at capitulation bottom"


def test_dynamic_atr_boundaries_structure_and_values(
    generator: LuxAlgoSignalGenerator,
    synthetic_market_data: pd.DataFrame,
):
    """
    Given historical series,
    When dynamic ATR boundaries are calculated,
    Then upper boundary is strictly greater than close and lower boundary is strictly less than close.
    """
    contrarian = generator.generate_contrarian_signals(
        high=synthetic_market_data["high"],
        low=synthetic_market_data["low"],
        close=synthetic_market_data["close"],
        atr=synthetic_market_data["atr"],
    )

    upper = np.asarray(contrarian.upper_boundary)
    lower = np.asarray(contrarian.lower_boundary)
    close = synthetic_market_data["close"].to_numpy()

    assert np.all(upper >= close), "Dynamic upper boundary must be greater than or equal to close"
    assert np.all(lower <= close), "Dynamic lower boundary must be less than or equal to close"
    assert np.all(upper > lower), "Dynamic upper boundary must be strictly greater than lower boundary"


def test_differentiation_between_confirmation_and_contrarian_signals(
    generator: LuxAlgoSignalGenerator,
    synthetic_market_data: pd.DataFrame,
):
    """
    Given both confirmation and contrarian signals generated on the same series,
    When comparing signal instances,
    Then contrarian signals are strictly separated from confirmation signals,
    and mutual exclusivity holds (e.g. confirmation buy and contrarian sell do not trigger on same bar).
    """
    signals: LuxAlgoSignals = generator.generate_all_signals(synthetic_market_data)

    # 1. Output object contains separate, accessible arrays for both types
    assert isinstance(signals, LuxAlgoSignals)
    assert hasattr(signals, "confirmation_buy")
    assert hasattr(signals, "confirmation_sell")
    assert hasattr(signals, "contrarian_buy")
    assert hasattr(signals, "contrarian_sell")

    # 2. Mutual exclusivity: Confirmation Buy and Contrarian Buy represent distinct market mechanics
    # A bar cannot be simultaneously Confirmation Buy and Contrarian Sell
    conflict_buy_vs_contrarian_sell = np.logical_and(
        signals.confirmation_buy, signals.contrarian_sell
    )
    assert not np.any(conflict_buy_vs_contrarian_sell), (
        "Confirmation Buy and Contrarian Sell must not collide on the same bar"
    )

    conflict_sell_vs_contrarian_buy = np.logical_and(
        signals.confirmation_sell, signals.contrarian_buy
    )
    assert not np.any(conflict_sell_vs_contrarian_buy), (
        "Confirmation Sell and Contrarian Buy must not collide on the same bar"
    )

    # 3. Method to retrieve isolated event indices exists and returns distinct sets
    conf_indices = signals.get_confirmation_indices()
    contr_indices = signals.get_contrarian_indices()

    assert isinstance(conf_indices, dict)
    assert "buy" in conf_indices and "sell" in conf_indices
    assert isinstance(contr_indices, dict)
    assert "buy" in contr_indices and "sell" in contr_indices

    # Contrarian sell indices must be differentiated from confirmation buy indices
    assert set(conf_indices["buy"]).isdisjoint(set(contr_indices["sell"]))
    assert set(conf_indices["sell"]).isdisjoint(set(contr_indices["buy"]))


# ============================================================================
# Input Validation & Edge Cases
# ============================================================================

def test_mismatched_series_lengths_raises_value_error(generator: LuxAlgoSignalGenerator):
    """Passing close and atr series of differing lengths must raise ValueError."""
    close = pd.Series([100.0, 101.0, 102.0])
    atr = pd.Series([1.0, 1.1])

    with pytest.raises(ValueError):
        generator.generate_confirmation_signals(close=close, atr=atr)


def test_empty_series_raises_value_error(generator: LuxAlgoSignalGenerator):
    """Passing empty Series must raise ValueError."""
    empty_series = pd.Series([], dtype=np.float64)

    with pytest.raises(ValueError):
        generator.generate_confirmation_signals(close=empty_series, atr=empty_series)

    with pytest.raises(ValueError):
        generator.generate_contrarian_signals(
            high=empty_series,
            low=empty_series,
            close=empty_series,
            atr=empty_series,
        )


def test_negative_or_zero_atr_raises_value_error(generator: LuxAlgoSignalGenerator):
    """Negative ATR values are physically invalid and must raise ValueError."""
    close = pd.Series([100.0, 101.0, 102.0, 103.0])
    negative_atr = pd.Series([1.0, -0.5, 1.2, 1.0])

    with pytest.raises(ValueError):
        generator.generate_confirmation_signals(close=close, atr=negative_atr)


def test_invalid_price_bars_high_less_than_low_raises_value_error(generator: LuxAlgoSignalGenerator):
    """High < Low in price data must raise ValueError."""
    close = pd.Series([100.0, 101.0, 102.0])
    high = pd.Series([101.0, 99.0, 103.0])  # Bar 1 has high (99) < low (100)
    low = pd.Series([99.0, 100.0, 101.0])
    atr = pd.Series([1.0, 1.0, 1.0])

    with pytest.raises(ValueError):
        generator.generate_contrarian_signals(high=high, low=low, close=close, atr=atr)


def test_missing_required_dataframe_columns_raises_value_error(generator: LuxAlgoSignalGenerator):
    """DataFrame missing 'atr' or 'high'/'low'/'close' must raise ValueError."""
    incomplete_df = pd.DataFrame(
        {
            "close": [100.0, 101.0, 102.0],
            "high": [101.0, 102.0, 103.0],
            # 'low' and 'atr' missing
        }
    )

    with pytest.raises(ValueError):
        generator.generate_all_signals(incomplete_df)


def test_nan_handling_raises_or_fills_gracefully(generator: LuxAlgoSignalGenerator):
    """
    Series containing NaNs at the beginning (e.g. from ATR warmup period)
    should be handled gracefully without crashing or emitting false positive signals during warmup.
    """
    close = pd.Series([np.nan, np.nan, 100.0, 101.0, 102.0, 103.0, 104.0, 105.0])
    atr = pd.Series([np.nan, np.nan, 1.5, 1.5, 1.5, 1.5, 1.5, 1.5])

    signals = generator.generate_confirmation_signals(close=close, atr=atr)

    # NaNs in warmup must evaluate to False in signal booleans
    assert not bool(signals.buy[0])
    assert not bool(signals.buy[1])
    assert not bool(signals.sell[0])
    assert not bool(signals.sell[1])


# ============================================================================
# Contrarian Boundary Calculation Parameter Verification
# ============================================================================

def test_contrarian_boundary_multiplier_adjusts_exhaustion_envelope():
    """
    Given two different exhaustion multipliers (e.g. 1.5 vs 3.0),
    When dynamic boundaries are calculated,
    Then higher multiplier generates strictly wider band envelopes.
    """
    length = 20
    close = pd.Series(np.full(length, 100.0))
    high = pd.Series(np.full(length, 101.0))
    low = pd.Series(np.full(length, 99.0))
    atr = pd.Series(np.full(length, 2.0))

    narrow_gen = LuxAlgoSignalGenerator(
        contrarian_config=ContrarianBoundaryConfig(exhaustion_multiplier=1.5)
    )
    wide_gen = LuxAlgoSignalGenerator(
        contrarian_config=ContrarianBoundaryConfig(exhaustion_multiplier=3.0)
    )

    narrow_res = narrow_gen.generate_contrarian_signals(high=high, low=low, close=close, atr=atr)
    wide_res = wide_gen.generate_contrarian_signals(high=high, low=low, close=close, atr=atr)

    narrow_spread = np.asarray(narrow_res.upper_boundary) - np.asarray(narrow_res.lower_boundary)
    wide_spread = np.asarray(wide_res.upper_boundary) - np.asarray(wide_res.lower_boundary)

    assert np.all(wide_spread > narrow_spread), "Wider multiplier must produce larger envelope spread"


def test_signals_to_dataframe_conversion(
    generator: LuxAlgoSignalGenerator,
    synthetic_market_data: pd.DataFrame,
):
    """
    Given generated LuxAlgoSignals,
    When exported to DataFrame format,
    Then all signal columns are present and correctly typed.
    """
    signals = generator.generate_all_signals(synthetic_market_data)
    df_signals = signals.to_dataframe()

    assert isinstance(df_signals, pd.DataFrame)
    expected_cols = [
        "confirmation_buy",
        "confirmation_sell",
        "contrarian_buy",
        "contrarian_sell",
        "upper_boundary",
        "lower_boundary",
    ]
    for col in expected_cols:
        assert col in df_signals.columns
    assert len(df_signals) == len(synthetic_market_data)