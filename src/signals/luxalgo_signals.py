"""
LuxAlgo Dynamic Confirmation & Contrarian Signal Generator.

Provides dynamic trend confirmation signals and contrarian exhaustion
reversal signals with dynamic ATR boundary levels.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional, Sequence, Union
import numpy as np
import pandas as pd


class SignalType(Enum):
    """Classifications of LuxAlgo trading signals."""

    CONFIRMATION_BUY = "CONFIRMATION_BUY"
    CONFIRMATION_SELL = "CONFIRMATION_SELL"
    CONTRARIAN_BUY = "CONTRARIAN_BUY"
    CONTRARIAN_SELL = "CONTRARIAN_SELL"
    NEUTRAL = "NEUTRAL"


@dataclass
class ConfirmationThresholdConfig:
    """Configuration for dynamic trend confirmation threshold conditions."""

    trend_threshold_multiplier: float = 1.5
    min_trend_bars: int = 3

    def __post_init__(self) -> None:
        if self.trend_threshold_multiplier <= 0:
            raise ValueError("trend_threshold_multiplier must be strictly positive.")
        if self.min_trend_bars < 1:
            raise ValueError("min_trend_bars must be at least 1.")


@dataclass
class ContrarianBoundaryConfig:
    """Configuration for dynamic ATR exhaustion boundary and reversal detection."""

    exhaustion_multiplier: float = 2.0
    reversal_lookback: int = 2

    def __post_init__(self) -> None:
        if self.exhaustion_multiplier <= 0:
            raise ValueError("exhaustion_multiplier must be strictly positive.")
        if self.reversal_lookback < 1:
            raise ValueError("reversal_lookback must be at least 1.")


@dataclass
class ConfirmationSignals:
    """Output container for confirmation signal arrays."""

    buy: np.ndarray
    sell: np.ndarray


@dataclass
class ContrarianSignals:
    """Output container for contrarian signal arrays and dynamic ATR boundaries."""

    buy: np.ndarray
    sell: np.ndarray
    upper_boundary: np.ndarray
    lower_boundary: np.ndarray


@dataclass
class LuxAlgoSignals:
    """Complete consolidated signal suite containing confirmation and contrarian signals."""

    confirmation_buy: np.ndarray
    confirmation_sell: np.ndarray
    contrarian_buy: np.ndarray
    contrarian_sell: np.ndarray
    upper_boundary: np.ndarray
    lower_boundary: np.ndarray
    index: Optional[pd.Index] = None

    def get_confirmation_indices(self) -> Dict[str, List[int]]:
        """Return discrete trigger index positions for confirmation signals."""
        return {
            "buy": np.where(self.confirmation_buy)[0].tolist(),
            "sell": np.where(self.confirmation_sell)[0].tolist(),
        }

    def get_contrarian_indices(self) -> Dict[str, List[int]]:
        """Return discrete trigger index positions for contrarian signals."""
        return {
            "buy": np.where(self.contrarian_buy)[0].tolist(),
            "sell": np.where(self.contrarian_sell)[0].tolist(),
        }

    def to_dataframe(self) -> pd.DataFrame:
        """Export all generated signal indicators and boundary levels to a DataFrame."""
        return pd.DataFrame(
            {
                "confirmation_buy": self.confirmation_buy,
                "confirmation_sell": self.confirmation_sell,
                "contrarian_buy": self.contrarian_buy,
                "contrarian_sell": self.contrarian_sell,
                "upper_boundary": self.upper_boundary,
                "lower_boundary": self.lower_boundary,
            },
            index=self.index,
        )


class LuxAlgoSignalGenerator:
    """Generates dynamic confirmation trend signals and contrarian reversal signals."""

    def __init__(
        self,
        confirmation_config: Optional[ConfirmationThresholdConfig] = None,
        contrarian_config: Optional[ContrarianBoundaryConfig] = None,
    ) -> None:
        self.confirmation_config = confirmation_config or ConfirmationThresholdConfig()
        self.contrarian_config = contrarian_config or ContrarianBoundaryConfig()

    def generate_confirmation_signals(
        self,
        close: Union[pd.Series, np.ndarray, Sequence[float]],
        atr: Union[pd.Series, np.ndarray, Sequence[float]],
    ) -> ConfirmationSignals:
        """
        Evaluate trend confirmation signals based on displacement threshold vs ATR.

        Returns ConfirmationSignals containing boolean buy and sell arrays.
        """
        close_arr = np.asarray(close, dtype=np.float64)
        atr_arr = np.asarray(atr, dtype=np.float64)

        if len(close_arr) == 0:
            raise ValueError("Input series cannot be empty.")
        if len(close_arr) != len(atr_arr):
            raise ValueError("Close and ATR series must have identical lengths.")

        valid_atr = atr_arr[~np.isnan(atr_arr)]
        if np.any(valid_atr <= 0):
            raise ValueError("ATR values must be strictly positive.")

        n = len(close_arr)
        buy = np.zeros(n, dtype=bool)
        sell = np.zeros(n, dtype=bool)

        min_bars = self.confirmation_config.min_trend_bars
        multiplier = self.confirmation_config.trend_threshold_multiplier

        for i in range(min_bars, n):
            if (
                np.isnan(close_arr[i])
                or np.isnan(atr_arr[i])
                or np.isnan(close_arr[i - 1])
                or np.any(np.isnan(close_arr[i - min_bars : i + 1]))
            ):
                continue

            threshold = multiplier * atr_arr[i]
            delta = close_arr[i] - close_arr[i - min_bars]

            if delta > threshold and close_arr[i] > close_arr[i - 1]:
                buy[i] = True
            elif -delta > threshold and close_arr[i] < close_arr[i - 1]:
                sell[i] = True

        return ConfirmationSignals(buy=buy, sell=sell)

    def generate_contrarian_signals(
        self,
        high: Union[pd.Series, np.ndarray, Sequence[float]],
        low: Union[pd.Series, np.ndarray, Sequence[float]],
        close: Union[pd.Series, np.ndarray, Sequence[float]],
        atr: Union[pd.Series, np.ndarray, Sequence[float]],
    ) -> ContrarianSignals:
        """
        Evaluate contrarian reversal signals based on dynamic ATR boundary levels.

        Returns ContrarianSignals containing buy/sell arrays and dynamic boundaries.
        """
        high_arr = np.asarray(high, dtype=np.float64)
        low_arr = np.asarray(low, dtype=np.float64)
        close_arr = np.asarray(close, dtype=np.float64)
        atr_arr = np.asarray(atr, dtype=np.float64)

        if len(close_arr) == 0:
            raise ValueError("Input series cannot be empty.")
        if not (len(high_arr) == len(low_arr) == len(close_arr) == len(atr_arr)):
            raise ValueError("High, low, close, and ATR series must have identical lengths.")

        valid_atr = atr_arr[~np.isnan(atr_arr)]
        if np.any(valid_atr <= 0):
            raise ValueError("ATR values must be strictly positive.")

        valid_hl = ~np.isnan(high_arr) & ~np.isnan(low_arr)
        if np.any(high_arr[valid_hl] < low_arr[valid_hl]):
            raise ValueError("High prices cannot be less than low prices.")

        mult = self.contrarian_config.exhaustion_multiplier
        upper_boundary = close_arr + (mult * atr_arr)
        lower_boundary = close_arr - (mult * atr_arr)

        n = len(close_arr)
        buy = np.zeros(n, dtype=bool)
        sell = np.zeros(n, dtype=bool)
        lookback = self.contrarian_config.reversal_lookback

        for i in range(1, n):
            if (
                np.isnan(close_arr[i])
                or np.isnan(close_arr[i - 1])
                or np.isnan(atr_arr[i])
                or np.isnan(high_arr[i])
                or np.isnan(low_arr[i])
            ):
                continue

            start_idx = max(0, i - lookback)

            # Exhaustion checks across lookback window
            has_upper_exhaustion = np.any(
                high_arr[start_idx : i + 1] >= upper_boundary[start_idx : i + 1]
            )
            has_lower_exhaustion = np.any(
                low_arr[start_idx : i + 1] <= lower_boundary[start_idx : i + 1]
            )

            # Bearish reversal onset
            prev_bear_reversal = (
                (i == 1)
                or np.isnan(close_arr[i - 2])
                or (close_arr[i - 1] >= close_arr[i - 2])
            )
            if has_upper_exhaustion and (close_arr[i] < close_arr[i - 1]) and prev_bear_reversal:
                sell[i] = True

            # Bullish reversal onset
            prev_bull_reversal = (
                (i == 1)
                or np.isnan(close_arr[i - 2])
                or (close_arr[i - 1] <= close_arr[i - 2])
            )
            if has_lower_exhaustion and (close_arr[i] > close_arr[i - 1]) and prev_bull_reversal:
                buy[i] = True

        return ContrarianSignals(
            buy=buy,
            sell=sell,
            upper_boundary=upper_boundary,
            lower_boundary=lower_boundary,
        )

    def generate_all_signals(self, data: pd.DataFrame) -> LuxAlgoSignals:
        """
        Execute both confirmation and contrarian generators and differentiate outputs.

        Enforces mutual exclusivity between opposing signal classifications.
        """
        required_cols = {"close", "high", "low", "atr"}
        if not required_cols.issubset(data.columns):
            missing = required_cols - set(data.columns)
            raise ValueError(f"DataFrame missing required columns: {missing}")
        if len(data) == 0:
            raise ValueError("DataFrame cannot be empty.")

        conf = self.generate_confirmation_signals(data["close"], data["atr"])
        contr = self.generate_contrarian_signals(
            high=data["high"],
            low=data["low"],
            close=data["close"],
            atr=data["atr"],
        )

        # Enforce mutual exclusivity between confirmation and contrarian counter-signals
        conf_buy = conf.buy & (~contr.sell)
        conf_sell = conf.sell & (~contr.buy)
        contr_buy = contr.buy & (~conf_sell)
        contr_sell = contr.sell & (~conf_buy)

        return LuxAlgoSignals(
            confirmation_buy=conf_buy,
            confirmation_sell=conf_sell,
            contrarian_buy=contr_buy,
            contrarian_sell=contr_sell,
            upper_boundary=contr.upper_boundary,
            lower_boundary=contr.lower_boundary,
            index=data.index,
        )