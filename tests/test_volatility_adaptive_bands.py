"""
Unit tests for LuxAlgo Volatility Adaptive Bands Math.
Requirement: Story 3.1.2: LuxAlgo Volatility Adaptive Bands Math
Target module: src/indicators/volatility_adaptive_bands.py
"""

import numpy as np
import pandas as pd
import pytest

from src.indicators.volatility_adaptive_bands import (
    VolatilityAdaptiveBandsResult,
    calculate_volatility_adaptive_bands,
)


@pytest.fixture
def deterministic_prices() -> np.ndarray:
    """Deterministic synthetic price series with 100 observations."""
    rng = np.random.default_rng(seed=42)
    # Generate geometric Brownian motion-like series
    returns = rng.normal(loc=0.0005, scale=0.015, size=100)
    prices = 100.0 * np.cumprod(1.0 + returns)
    return prices


@pytest.fixture
def constant_prices() -> np.ndarray:
    """Constant price series for zero-volatility edge case."""
    return np.full(50, 150.0, dtype=np.float64)


class TestVolatilityAdaptiveBandsCalculation:
    """Tests core calculation logic and ordering constraints (AC 1)."""

    def test_output_structure_and_length(self, deterministic_prices: np.ndarray):
        """Dynamic upper, median, and lower arrays must match input series length."""
        lookback = 14
        multiplier = 2.0

        result = calculate_volatility_adaptive_bands(
            deterministic_prices, lookback=lookback, multiplier=multiplier
        )

        assert isinstance(result, (tuple, VolatilityAdaptiveBandsResult))
        upper, median, lower = result.upper, result.median, result.lower

        expected_len = len(deterministic_prices)
        assert len(upper) == expected_len
        assert len(median) == expected_len
        assert len(lower) == expected_len

    def test_tuple_unpacking_support(self, deterministic_prices: np.ndarray):
        """Result must support standard 3-tuple unpacking."""
        upper, median, lower = calculate_volatility_adaptive_bands(
            deterministic_prices, lookback=20, multiplier=2.0
        )
        assert len(upper) == len(deterministic_prices)
        assert len(median) == len(deterministic_prices)
        assert len(lower) == len(deterministic_prices)

    def test_ordering_constraint_lower_le_median_le_upper(
        self, deterministic_prices: np.ndarray
    ):
        """For all computed (non-NaN) indices: lower <= median <= upper."""
        lookback = 14
        multiplier = 2.0

        upper, median, lower = calculate_volatility_adaptive_bands(
            deterministic_prices, lookback=lookback, multiplier=multiplier
        )

        # Identify valid indices where bands are computed
        valid_mask = ~np.isnan(upper) & ~np.isnan(median) & ~np.isnan(lower)
        assert np.any(valid_mask), "At least some indices should have valid computed values"

        # Apply numerical tolerance for float comparisons
        tolerance = 1e-9
        assert np.all(lower[valid_mask] <= median[valid_mask] + tolerance), (
            "Violated constraint: lower <= median"
        )
        assert np.all(median[valid_mask] <= upper[valid_mask] + tolerance), (
            "Violated constraint: median <= upper"
        )
        assert np.all(lower[valid_mask] <= upper[valid_mask] + tolerance), (
            "Violated constraint: lower <= upper"
        )

    def test_bands_with_pandas_series_input(self, deterministic_prices: np.ndarray):
        """Input as a pandas Series returns aligned arrays preserving ordering."""
        series_prices = pd.Series(
            deterministic_prices,
            index=pd.date_range("2024-01-01", periods=len(deterministic_prices), freq="D"),
        )
        result = calculate_volatility_adaptive_bands(series_prices, lookback=14, multiplier=2.0)

        upper, median, lower = result.upper, result.median, result.lower
        assert len(upper) == len(series_prices)

        valid_mask = ~np.isnan(upper)
        assert np.all(lower[valid_mask] <= median[valid_mask] + 1e-9)
        assert np.all(median[valid_mask] <= upper[valid_mask] + 1e-9)

    def test_bands_with_python_list_input(self):
        """Input as a raw Python list of floats is supported."""
        price_list = [100.0 + i * 0.5 for i in range(30)]
        upper, median, lower = calculate_volatility_adaptive_bands(
            price_list, lookback=10, multiplier=1.5
        )

        assert len(upper) == len(price_list)
        assert len(median) == len(price_list)
        assert len(lower) == len(price_list)

        valid_mask = ~np.isnan(upper)
        assert np.all(np.asarray(lower)[valid_mask] <= np.asarray(median)[valid_mask] + 1e-9)
        assert np.all(np.asarray(median)[valid_mask] <= np.asarray(upper)[valid_mask] + 1e-9)

    def test_multiplier_scaling_effect(self, deterministic_prices: np.ndarray):
        """Higher multiplier must yield wider or equal band widths for all computed points."""
        lookback = 14
        m1 = 1.0
        m2 = 2.5

        res_narrow = calculate_volatility_adaptive_bands(
            deterministic_prices, lookback=lookback, multiplier=m1
        )
        res_wide = calculate_volatility_adaptive_bands(
            deterministic_prices, lookback=lookback, multiplier=m2
        )

        valid_mask = ~np.isnan(res_narrow.upper) & ~np.isnan(res_wide.upper)

        width_narrow = res_narrow.upper[valid_mask] - res_narrow.lower[valid_mask]
        width_wide = res_wide.upper[valid_mask] - res_wide.lower[valid_mask]

        # Multiplier 2.5 must create strictly wider or equal bands than multiplier 1.0
        assert np.all(width_wide >= width_narrow - 1e-9)
        # Check median is invariant to multiplier changes
        np.testing.assert_allclose(
            res_narrow.median[valid_mask],
            res_wide.median[valid_mask],
            rtol=1e-7,
            atol=1e-7,
        )

    def test_zero_volatility_collapse(self, constant_prices: np.ndarray):
        """Zero volatility collapses upper, median, and lower to the constant price."""
        lookback = 10
        upper, median, lower = calculate_volatility_adaptive_bands(
            constant_prices, lookback=lookback, multiplier=2.0
        )

        valid_mask = ~np.isnan(upper)
        np.testing.assert_allclose(upper[valid_mask], constant_prices[valid_mask], atol=1e-7)
        np.testing.assert_allclose(median[valid_mask], constant_prices[valid_mask], atol=1e-7)
        np.testing.assert_allclose(lower[valid_mask], constant_prices[valid_mask], atol=1e-7)

    def test_volatility_expansion_on_spike(self):
        """A volatility explosion should widen the adaptive bands."""
        lookback = 10
        prices = np.full(50, 100.0)
        # Introduce abrupt volatility spike in the second half
        prices[25:] = [100.0 + (30.0 if i % 2 == 0 else -30.0) for i in range(25)]

        upper, median, lower = calculate_volatility_adaptive_bands(
            prices, lookback=lookback, multiplier=2.0
        )

        # Baseline width before volatility spike (after warmup)
        pre_spike_width = upper[24] - lower[24]
        # Width after volatility shock has established
        post_spike_width = upper[35] - lower[35]

        assert post_spike_width > pre_spike_width


class TestVolatilityAdaptiveBandsBoundaryConditions:
    """Tests boundary conditions: empty input, small series, lookback edge cases (AC 2)."""

    def test_empty_price_list_input(self):
        """Empty list input returns empty arrays."""
        upper, median, lower = calculate_volatility_adaptive_bands(
            [], lookback=14, multiplier=2.0
        )

        assert len(upper) == 0
        assert len(median) == 0
        assert len(lower) == 0
        assert isinstance(upper, np.ndarray)
        assert isinstance(median, np.ndarray)
        assert isinstance(lower, np.ndarray)

    def test_empty_numpy_array_input(self):
        """Empty numpy array input returns empty arrays."""
        upper, median, lower = calculate_volatility_adaptive_bands(
            np.array([], dtype=np.float64), lookback=20, multiplier=2.0
        )

        assert len(upper) == 0
        assert len(median) == 0
        assert len(lower) == 0

    def test_series_shorter_than_lookback_returns_nan_padded(self):
        """Series shorter than lookback returns arrays padded with NaNs of same length."""
        short_series = [10.0, 11.5, 12.0, 11.8]  # length 4
        lookback = 10
        upper, median, lower = calculate_volatility_adaptive_bands(
            short_series, lookback=lookback, multiplier=2.0
        )

        assert len(upper) == len(short_series)
        assert len(median) == len(short_series)
        assert len(lower) == len(short_series)

        # All values should be NaN since warmup period cannot be satisfied
        assert np.all(np.isnan(upper))
        assert np.all(np.isnan(median))
        assert np.all(np.isnan(lower))

    def test_single_element_series(self):
        """Single-element series with lookback > 1 returns single NaN element per band."""
        single_price = [105.0]
        upper, median, lower = calculate_volatility_adaptive_bands(
            single_price, lookback=5, multiplier=2.0
        )

        assert len(upper) == 1
        assert len(median) == 1
        assert len(lower) == 1
        assert np.isnan(upper[0])
        assert np.isnan(median[0])
        assert np.isnan(lower[0])

    def test_exact_lookback_boundary(self):
        """Series length exactly equal to lookback computes the final point or pads correctly."""
        lookback = 5
        prices = [100.0, 101.0, 102.0, 101.5, 103.0]  # length 5
        upper, median, lower = calculate_volatility_adaptive_bands(
            prices, lookback=lookback, multiplier=2.0
        )

        assert len(upper) == lookback
        assert len(median) == lookback
        assert len(lower) == lookback

        # Prior lookback - 1 elements are NaN warmup
        assert np.all(np.isnan(upper[: lookback - 1]))
        assert np.all(np.isnan(median[: lookback - 1]))
        assert np.all(np.isnan(lower[: lookback - 1]))

        # The final index must be computed and satisfy ordering constraint
        assert not np.isnan(upper[-1])
        assert not np.isnan(median[-1])
        assert not np.isnan(lower[-1])
        assert lower[-1] <= median[-1] <= upper[-1]


class TestVolatilityAdaptiveBandsInputValidation:
    """Tests validation of input parameters (lookback, multiplier, data types)."""

    def test_negative_or_zero_lookback_raises_value_error(self, deterministic_prices: np.ndarray):
        """Lookback <= 0 must raise ValueError."""
        with pytest.raises(ValueError):
            calculate_volatility_adaptive_bands(
                deterministic_prices, lookback=0, multiplier=2.0
            )

        with pytest.raises(ValueError):
            calculate_volatility_adaptive_bands(
                deterministic_prices, lookback=-5, multiplier=2.0
            )

    def test_non_integer_lookback_raises_type_error(self, deterministic_prices: np.ndarray):
        """Float lookback must raise TypeError."""
        with pytest.raises(TypeError):
            calculate_volatility_adaptive_bands(
                deterministic_prices, lookback=14.5, multiplier=2.0  # type: ignore
            )

    def test_negative_multiplier_raises_value_error(self, deterministic_prices: np.ndarray):
        """Negative multiplier must raise ValueError."""
        with pytest.raises(ValueError):
            calculate_volatility_adaptive_bands(
                deterministic_prices, lookback=14, multiplier=-1.5
            )

    def test_zero_multiplier_allowed(self, deterministic_prices: np.ndarray):
        """Multiplier == 0 is valid and upper == median == lower."""
        upper, median, lower = calculate_volatility_adaptive_bands(
            deterministic_prices, lookback=14, multiplier=0.0
        )
        valid_mask = ~np.isnan(upper)
        np.testing.assert_allclose(upper[valid_mask], median[valid_mask], atol=1e-9)
        np.testing.assert_allclose(lower[valid_mask], median[valid_mask], atol=1e-9)

    def test_non_numeric_series_elements_raises_error(self):
        """Non-numeric string values in prices must raise ValueError or TypeError."""
        invalid_prices = [100.0, "invalid", 102.0]
        with pytest.raises((ValueError, TypeError)):
            calculate_volatility_adaptive_bands(
                invalid_prices, lookback=2, multiplier=1.5  # type: ignore
            )

    def test_series_containing_internal_nans_handled_gracefully(self):
        """Series containing NaN entries propagates NaNs without unhandled exceptions."""
        prices = [100.0, 102.0, np.nan, 103.0, 104.0, 105.0, 106.0]
        upper, median, lower = calculate_volatility_adaptive_bands(
            prices, lookback=3, multiplier=1.5
        )

        assert len(upper) == len(prices)
        assert len(median) == len(prices)
        assert len(lower) == len(prices)
        # NaN at index 2 must result in NaN bands for index 2
        assert np.isnan(upper[2])
        assert np.isnan(median[2])
        assert np.isnan(lower[2])