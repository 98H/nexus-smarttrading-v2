"""LuxAlgo Volatility Adaptive Bands indicator implementation."""

from typing import NamedTuple, Sequence, Union

import numpy as np
import pandas as pd


class VolatilityAdaptiveBandsResult(NamedTuple):
    """Container for Volatility Adaptive Bands calculation results."""

    upper: np.ndarray
    median: np.ndarray
    lower: np.ndarray


def calculate_volatility_adaptive_bands(
    prices: Union[Sequence[float], np.ndarray, pd.Series],
    lookback: int = 14,
    multiplier: float = 2.0,
) -> VolatilityAdaptiveBandsResult:
    """Calculate LuxAlgo Volatility Adaptive Bands for a price series.

    Parameters
    ----------
    prices : Sequence[float] | np.ndarray | pd.Series
        Series of price observations.
    lookback : int, default 14
        Rolling lookback period. Must be an integer greater than zero.
    multiplier : float, default 2.0
        Band width multiplier applied to the volatility component.
        Must be a non-negative number.

    Returns
    -------
    VolatilityAdaptiveBandsResult
        NamedTuple containing upper, median, and lower band arrays matching the
        input series length.

    Raises
    ------
    TypeError
        If lookback is not an integer or multiplier is non-numeric.
    ValueError
        If lookback <= 0, multiplier < 0, or prices contain non-numeric data.
    """
    if not isinstance(lookback, int) or isinstance(lookback, bool):
        raise TypeError(f"lookback must be an integer, got {type(lookback).__name__}")
    if lookback <= 0:
        raise ValueError(f"lookback must be greater than zero, got {lookback}")

    if not isinstance(multiplier, (int, float)) or isinstance(multiplier, bool):
        raise TypeError(f"multiplier must be a float or int, got {type(multiplier).__name__}")
    if multiplier < 0:
        raise ValueError(f"multiplier must be non-negative, got {multiplier}")

    try:
        prices_array = np.asarray(prices, dtype=np.float64)
    except (ValueError, TypeError) as err:
        raise ValueError(f"prices series must contain numeric values: {err}") from err

    if prices_array.ndim == 0:
        prices_array = prices_array.reshape(-1)
    elif prices_array.ndim > 1:
        raise ValueError(f"prices must be 1-dimensional, got shape {prices_array.shape}")

    n = len(prices_array)
    if n == 0:
        empty = np.array([], dtype=np.float64)
        return VolatilityAdaptiveBandsResult(
            upper=empty.copy(),
            median=empty.copy(),
            lower=empty.copy(),
        )

    if n < lookback:
        nan_arr = np.full(n, np.nan, dtype=np.float64)
        return VolatilityAdaptiveBandsResult(
            upper=nan_arr.copy(),
            median=nan_arr.copy(),
            lower=nan_arr.copy(),
        )

    series = pd.Series(prices_array)
    rolling_window = series.rolling(window=lookback, min_periods=lookback)

    median_arr = rolling_window.mean().to_numpy(dtype=np.float64)
    std_arr = rolling_window.std(ddof=0).to_numpy(dtype=np.float64)

    # Clean numerical precision artifacts (e.g. tiny negative variance)
    std_arr = np.where(np.isnan(std_arr), np.nan, np.maximum(std_arr, 0.0))

    upper_arr = median_arr + multiplier * std_arr
    lower_arr = median_arr - multiplier * std_arr

    return VolatilityAdaptiveBandsResult(
        upper=upper_arr,
        median=median_arr,
        lower=lower_arr,
    )