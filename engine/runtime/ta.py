"""Pine Script v5 standard technical analysis library implementation."""

from __future__ import annotations

from collections import deque
import math
from typing import List

from engine.runtime.series import Series


def sma(source: Series, length: int) -> Series:
    """Pine Script v5 Simple Moving Average (SMA)."""
    if isinstance(length, bool) or not isinstance(length, int) or length <= 0:
        raise ValueError(f"Invalid length: {length}. Length must be a positive integer.")

    out = Series(name=f"sma({source.name}, {length})")
    window: deque[float] = deque(maxlen=length)

    def _on_value(val: float) -> None:
        window.append(val)
        if len(window) < length:
            out.append(math.nan)
        else:
            out.append(sum(window) / float(length))

    source.subscribe(_on_value, replay=True)
    return out


def ema(source: Series, length: int) -> Series:
    """Pine Script v5 Exponential Moving Average (EMA)."""
    if isinstance(length, bool) or not isinstance(length, int) or length <= 0:
        raise ValueError(f"Invalid length: {length}. Length must be a positive integer.")

    out = Series(name=f"ema({source.name}, {length})")
    alpha = 2.0 / (float(length) + 1.0)
    seed_window: List[float] = []
    prev_ema = math.nan
    count = 0

    def _on_value(val: float) -> None:
        nonlocal prev_ema, count
        if count < length - 1:
            seed_window.append(val)
            out.append(math.nan)
        elif count == length - 1:
            seed_window.append(val)
            prev_ema = sum(seed_window) / float(length)
            seed_window.clear()
            out.append(prev_ema)
        else:
            prev_ema = (alpha * val) + ((1.0 - alpha) * prev_ema)
            out.append(prev_ema)
        count += 1

    source.subscribe(_on_value, replay=True)
    return out


def rma(source: Series, length: int) -> Series:
    """Pine Script v5 Relative Moving Average (Wilder's Smoothing)."""
    if isinstance(length, bool) or not isinstance(length, int) or length <= 0:
        raise ValueError(f"Invalid length: {length}. Length must be a positive integer.")

    out = Series(name=f"rma({source.name}, {length})")
    alpha = 1.0 / float(length)
    seed_window: List[float] = []
    prev_rma = math.nan
    count = 0

    def _on_value(val: float) -> None:
        nonlocal prev_rma, count
        if count < length - 1:
            seed_window.append(val)
            out.append(math.nan)
        elif count == length - 1:
            seed_window.append(val)
            prev_rma = sum(seed_window) / float(length)
            seed_window.clear()
            out.append(prev_rma)
        else:
            prev_rma = (alpha * val) + ((1.0 - alpha) * prev_rma)
            out.append(prev_rma)
        count += 1

    source.subscribe(_on_value, replay=True)
    return out


def rsi(source: Series, length: int) -> Series:
    """Pine Script v5 Relative Strength Index (RSI)."""
    if isinstance(length, bool) or not isinstance(length, int) or length <= 0:
        raise ValueError(f"Invalid length: {length}. Length must be a positive integer.")

    out = Series(name=f"rsi({source.name}, {length})")
    alpha = 1.0 / float(length)
    prev_val = math.nan
    prev_rma_u = math.nan
    prev_rma_d = math.nan
    seed_u: List[float] = []
    seed_d: List[float] = []
    count = 0

    def _resolve_rsi(ru: float, rd: float) -> float:
        if math.isnan(ru) or math.isnan(rd):
            return math.nan
        if rd == 0.0:
            return 50.0 if ru == 0.0 else 100.0
        rs = ru / rd
        return 100.0 - (100.0 / (1.0 + rs))

    def _on_value(val: float) -> None:
        nonlocal prev_val, prev_rma_u, prev_rma_d, count
        if count == 0:
            prev_val = val
            out.append(math.nan)
        else:
            diff = val - prev_val
            prev_val = val
            u = max(diff, 0.0)
            d = max(-diff, 0.0)

            if count < length:
                seed_u.append(u)
                seed_d.append(d)
                out.append(math.nan)
            elif count == length:
                seed_u.append(u)
                seed_d.append(d)
                prev_rma_u = sum(seed_u) / float(length)
                prev_rma_d = sum(seed_d) / float(length)
                seed_u.clear()
                seed_d.clear()
                out.append(_resolve_rsi(prev_rma_u, prev_rma_d))
            else:
                prev_rma_u = (alpha * u) + ((1.0 - alpha) * prev_rma_u)
                prev_rma_d = (alpha * d) + ((1.0 - alpha) * prev_rma_d)
                out.append(_resolve_rsi(prev_rma_u, prev_rma_d))
        count += 1

    source.subscribe(_on_value, replay=True)
    return out