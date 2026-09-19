import math
import pytest
from typing import List, Optional

# Target modules to test
from engine.runtime.series import Series, ExecutionContext
import engine.runtime.ta as ta


# =====================================================================
# Deterministic Mathematical Reference Implementations (Pine Script v5)
# =====================================================================

def pine_reference_sma(values: List[float], length: int) -> List[float]:
    """Pine Script v5 SMA reference formula."""
    result: List[float] = []
    for i in range(len(values)):
        if i < length - 1:
            result.append(math.nan)
        else:
            window = values[i - length + 1 : i + 1]
            result.append(sum(window) / float(length))
    return result


def pine_reference_rma(values: List[float], length: int) -> List[float]:
    """Pine Script v5 RMA (Wilder's Smoothing) reference formula."""
    result: List[float] = []
    alpha = 1.0 / float(length)
    prev_rma = math.nan

    for i in range(len(values)):
        val = values[i]
        if i < length - 1:
            result.append(math.nan)
        elif i == length - 1:
            seed_window = values[:length]
            prev_rma = sum(seed_window) / float(length)
            result.append(prev_rma)
        else:
            prev_rma = (alpha * val) + ((1.0 - alpha) * prev_rma)
            result.append(prev_rma)
    return result


def pine_reference_ema(values: List[float], length: int) -> List[float]:
    """Pine Script v5 EMA reference formula."""
    result: List[float] = []
    alpha = 2.0 / (float(length) + 1.0)
    prev_ema = math.nan

    for i in range(len(values)):
        val = values[i]
        if i < length - 1:
            result.append(math.nan)
        elif i == length - 1:
            seed_window = values[:length]
            prev_ema = sum(seed_window) / float(length)
            result.append(prev_ema)
        else:
            prev_ema = (alpha * val) + ((1.0 - alpha) * prev_ema)
            result.append(prev_ema)
    return result


def pine_reference_rsi(values: List[float], length: int) -> List[float]:
    """Pine Script v5 RSI reference formula based on RMA of gains and losses."""
    n = len(values)
    if n == 0:
        return []

    u_changes: List[float] = [math.nan]
    d_changes: List[float] = [math.nan]

    for i in range(1, n):
        diff = values[i] - values[i - 1]
        u_changes.append(max(diff, 0.0))
        d_changes.append(max(-diff, 0.0))

    # Pine Script seeds RMA after observing 'length' changes (at bar_index == length)
    rma_u: List[float] = [math.nan] * n
    rma_d: List[float] = [math.nan] * n
    alpha = 1.0 / float(length)

    if n > length:
        # Changes start at index 1 up to length inclusive: length changes
        seed_u = u_changes[1 : length + 1]
        seed_d = d_changes[1 : length + 1]
        rma_u[length] = sum(seed_u) / float(length)
        rma_d[length] = sum(seed_d) / float(length)

        for i in range(length + 1, n):
            rma_u[i] = (alpha * u_changes[i]) + ((1.0 - alpha) * rma_u[i - 1])
            rma_d[i] = (alpha * d_changes[i]) + ((1.0 - alpha) * rma_d[i - 1])

    rsi_result: List[float] = []
    for i in range(n):
        ru = rma_u[i]
        rd = rma_d[i]
        if math.isnan(ru) or math.isnan(rd):
            rsi_result.append(math.nan)
        elif rd == 0.0:
            rsi_result.append(50.0 if ru == 0.0 else 100.0)
        else:
            rs = ru / rd
            res = 100.0 - (100.0 / (1.0 + rs))
            rsi_result.append(res)

    return rsi_result


# =====================================================================
# Fixtures
# =====================================================================

@pytest.fixture
def sample_prices() -> List[float]:
    """Deterministic sample prices simulating realistic OHLCV close stream."""
    return [
        100.0, 102.5, 101.0, 104.0, 103.5, 106.0, 105.0, 107.5, 109.0, 108.0,
        110.5, 112.0, 111.0, 109.5, 111.5, 113.0, 112.5, 114.0, 115.5, 114.0,
        113.0, 111.5, 112.0, 114.5, 115.0, 116.5, 117.0, 115.5, 114.0, 113.5,
        112.0, 110.5, 109.0, 108.0, 107.5, 108.5, 110.0, 111.5, 113.0, 115.0
    ]


@pytest.fixture
def empty_context() -> ExecutionContext:
    """Provides a fresh ExecutionContext instance."""
    return ExecutionContext()


# =====================================================================
# Unit Tests: Series & ExecutionContext (engine/runtime/series.py)
# =====================================================================

class TestSeriesRuntime:
    def test_series_initialization_empty(self):
        s = Series("test_series")
        assert len(s) == 0
        assert s.name == "test_series"

    def test_series_pine_indexing_convention(self):
        """
        In Pine Script v5, s[0] represents the current bar's value,
        s[1] represents 1 bar ago, s[k] represents k bars ago.
        """
        s = Series("close")
        values = [10.0, 20.0, 30.0]
        for v in values:
            s.append(v)

        assert len(s) == 3
        assert s[0] == pytest.approx(30.0, abs=1e-6)
        assert s[1] == pytest.approx(20.0, abs=1e-6)
        assert s[2] == pytest.approx(10.0, abs=1e-6)

    def test_series_lookback_out_of_bounds_returns_nan(self):
        """Pine Script returns `na` (represented as math.nan) when accessing past series history."""
        s = Series("close")
        s.append(100.0)
        s.append(105.0)

        assert s[0] == 105.0
        assert s[1] == 100.0
        assert math.isnan(s[2])
        assert math.isnan(s[100])

    def test_series_negative_index_disallowed(self):
        """Pine Script lookback indices cannot be negative (looking into future is disallowed)."""
        s = Series("close")
        s.append(10.0)
        with pytest.raises(IndexError):
            _ = s[-1]

    def test_execution_context_bar_step(self, empty_context: ExecutionContext):
        ctx = empty_context
        assert ctx.bar_index == -1

        ctx.new_bar(open=100.0, high=105.0, low=99.0, close=104.0, volume=1000.0, time=1600000000)
        assert ctx.bar_index == 0
        assert ctx.open[0] == 100.0
        assert ctx.high[0] == 105.0
        assert ctx.low[0] == 99.0
        assert ctx.close[0] == 104.0
        assert ctx.volume[0] == 1000.0

        ctx.new_bar(open=104.0, high=106.0, low=103.0, close=105.5, volume=1200.0, time=1600000060)
        assert ctx.bar_index == 1
        assert ctx.close[0] == 105.5
        assert ctx.close[1] == 104.0


# =====================================================================
# Unit Tests: ta.sma (engine/runtime/ta.py)
# =====================================================================

class TestTaSma:
    def test_sma_warmup_period_returns_nan(self):
        ctx = ExecutionContext()
        sma_series = ta.sma(ctx.close, 3)

        ctx.new_bar(open=10.0, high=10.0, low=10.0, close=10.0, volume=100.0)
        assert math.isnan(sma_series[0])

        ctx.new_bar(open=20.0, high=20.0, low=20.0, close=20.0, volume=100.0)
        assert math.isnan(sma_series[0])

        ctx.new_bar(open=30.0, high=30.0, low=30.0, close=30.0, volume=100.0)
        assert not math.isnan(sma_series[0])
        assert sma_series[0] == pytest.approx(20.0, abs=1e-6)

    def test_sma_deterministic_sequence(self):
        ctx = ExecutionContext()
        values = [10.0, 20.0, 30.0, 40.0, 50.0]
        sma_3 = ta.sma(ctx.close, 3)

        evaluated = []
        for v in values:
            ctx.new_bar(open=v, high=v, low=v, close=v, volume=1.0)
            evaluated.append(sma_3[0])

        assert math.isnan(evaluated[0])
        assert math.isnan(evaluated[1])
        assert evaluated[2] == pytest.approx(20.0, abs=1e-6)  # (10+20+30)/3
        assert evaluated[3] == pytest.approx(30.0, abs=1e-6)  # (20+30+40)/3
        assert evaluated[4] == pytest.approx(40.0, abs=1e-6)  # (30+40+50)/3

    def test_sma_historical_indexing_across_bars(self):
        ctx = ExecutionContext()
        values = [10.0, 20.0, 30.0, 40.0, 50.0]
        sma_3 = ta.sma(ctx.close, 3)

        for v in values:
            ctx.new_bar(open=v, high=v, low=v, close=v, volume=1.0)

        # Current bar is bar 4 (value 50.0, SMA = 40.0)
        assert sma_3[0] == pytest.approx(40.0, abs=1e-6)
        assert sma_3[1] == pytest.approx(30.0, abs=1e-6)
        assert sma_3[2] == pytest.approx(20.0, abs=1e-6)
        assert math.isnan(sma_3[3])
        assert math.isnan(sma_3[4])

    def test_sma_length_1_matches_source(self, sample_prices: List[float]):
        ctx = ExecutionContext()
        sma_1 = ta.sma(ctx.close, 1)

        for price in sample_prices:
            ctx.new_bar(open=price, high=price, low=price, close=price, volume=1.0)
            assert sma_1[0] == pytest.approx(price, abs=1e-6)

    def test_sma_precision_against_pine_reference(self, sample_prices: List[float]):
        ctx = ExecutionContext()
        length = 5
        sma_series = ta.sma(ctx.close, length)
        expected_values = pine_reference_sma(sample_prices, length)

        for idx, price in enumerate(sample_prices):
            ctx.new_bar(open=price, high=price, low=price, close=price, volume=1.0)
            exp = expected_values[idx]
            act = sma_series[0]
            if math.isnan(exp):
                assert math.isnan(act)
            else:
                assert act == pytest.approx(exp, abs=1e-6)

    @pytest.mark.parametrize("invalid_length", [0, -1, -10])
    def test_sma_invalid_length_raises_value_error(self, invalid_length: int):
        ctx = ExecutionContext()
        with pytest.raises(ValueError):
            ta.sma(ctx.close, invalid_length)


# =====================================================================
# Unit Tests: ta.ema (engine/runtime/ta.py)
# =====================================================================

class TestTaEma:
    def test_ema_warmup_and_seed_value(self):
        """Pine Script v5 seeds EMA with SMA of the first 'length' values."""
        ctx = ExecutionContext()
        ema_3 = ta.ema(ctx.close, 3)

        ctx.new_bar(open=10.0, high=10.0, low=10.0, close=10.0, volume=1.0)
        assert math.isnan(ema_3[0])

        ctx.new_bar(open=20.0, high=20.0, low=20.0, close=20.0, volume=1.0)
        assert math.isnan(ema_3[0])

        ctx.new_bar(open=30.0, high=30.0, low=30.0, close=30.0, volume=1.0)
        # Seed value at index 2 is SMA(10, 20, 30) = 20.0
        assert ema_3[0] == pytest.approx(20.0, abs=1e-6)

    def test_ema_smoothing_recursion(self):
        """
        Formula: alpha = 2 / (length + 1). For length 3, alpha = 2 / 4 = 0.5.
        Next EMA = 0.5 * 40.0 + 0.5 * 20.0 = 30.0
        """
        ctx = ExecutionContext()
        values = [10.0, 20.0, 30.0, 40.0, 50.0]
        ema_3 = ta.ema(ctx.close, 3)

        evaluated = []
        for v in values:
            ctx.new_bar(open=v, high=v, low=v, close=v, volume=1.0)
            evaluated.append(ema_3[0])

        assert math.isnan(evaluated[0])
        assert math.isnan(evaluated[1])
        assert evaluated[2] == pytest.approx(20.0, abs=1e-6)  # seed SMA
        assert evaluated[3] == pytest.approx(30.0, abs=1e-6)  # 0.5 * 40 + 0.5 * 20 = 30
        assert evaluated[4] == pytest.approx(40.0, abs=1e-6)  # 0.5 * 50 + 0.5 * 30 = 40

    def test_ema_historical_indexing_across_bars(self):
        ctx = ExecutionContext()
        values = [10.0, 20.0, 30.0, 40.0, 50.0]
        ema_3 = ta.ema(ctx.close, 3)

        for v in values:
            ctx.new_bar(open=v, high=v, low=v, close=v, volume=1.0)

        assert ema_3[0] == pytest.approx(40.0, abs=1e-6)
        assert ema_3[1] == pytest.approx(30.0, abs=1e-6)
        assert ema_3[2] == pytest.approx(20.0, abs=1e-6)
        assert math.isnan(ema_3[3])

    def test_ema_precision_against_pine_reference(self, sample_prices: List[float]):
        ctx = ExecutionContext()
        length = 10
        ema_series = ta.ema(ctx.close, length)
        expected_values = pine_reference_ema(sample_prices, length)

        for idx, price in enumerate(sample_prices):
            ctx.new_bar(open=price, high=price, low=price, close=price, volume=1.0)
            exp = expected_values[idx]
            act = ema_series[0]
            if math.isnan(exp):
                assert math.isnan(act)
            else:
                assert act == pytest.approx(exp, abs=1e-6)

    def test_ema_length_1_matches_source(self, sample_prices: List[float]):
        ctx = ExecutionContext()
        ema_1 = ta.ema(ctx.close, 1)

        for price in sample_prices:
            ctx.new_bar(open=price, high=price, low=price, close=price, volume=1.0)
            assert ema_1[0] == pytest.approx(price, abs=1e-6)

    @pytest.mark.parametrize("invalid_length", [0, -2])
    def test_ema_invalid_length_raises_value_error(self, invalid_length: int):
        ctx = ExecutionContext()
        with pytest.raises(ValueError):
            ta.ema(ctx.close, invalid_length)


# =====================================================================
# Unit Tests: ta.rma (engine/runtime/ta.py)
# =====================================================================

class TestTaRma:
    def test_rma_warmup_and_seed(self):
        """Pine Script v5 seeds RMA with SMA of first 'length' bars."""
        ctx = ExecutionContext()
        rma_3 = ta.rma(ctx.close, 3)

        ctx.new_bar(open=10.0, high=10.0, low=10.0, close=10.0, volume=1.0)
        ctx.new_bar(open=20.0, high=20.0, low=20.0, close=20.0, volume=1.0)
        assert math.isnan(rma_3[0])

        ctx.new_bar(open=30.0, high=30.0, low=30.0, close=30.0, volume=1.0)
        assert rma_3[0] == pytest.approx(20.0, abs=1e-6)

    def test_rma_wilder_smoothing_formula(self):
        """
        Formula: alpha = 1 / length. For length 3, alpha = 1/3.
        At bar 3 (val 40.0): (1/3)*40.0 + (2/3)*20.0 = 80/3 = 26.66666667
        At bar 4 (val 50.0): (1/3)*50.0 + (2/3)*(80/3) = 310/9 = 34.44444444
        """
        ctx = ExecutionContext()
        values = [10.0, 20.0, 30.0, 40.0, 50.0]
        rma_3 = ta.rma(ctx.close, 3)

        evaluated = []
        for v in values:
            ctx.new_bar(open=v, high=v, low=v, close=v, volume=1.0)
            evaluated.append(rma_3[0])

        assert math.isnan(evaluated[0])
        assert math.isnan(evaluated[1])
        assert evaluated[2] == pytest.approx(20.0, abs=1e-6)
        assert evaluated[3] == pytest.approx(80.0 / 3.0, abs=1e-6)
        assert evaluated[4] == pytest.approx(310.0 / 9.0, abs=1e-6)

    def test_rma_precision_against_pine_reference(self, sample_prices: List[float]):
        ctx = ExecutionContext()
        length = 7
        rma_series = ta.rma(ctx.close, length)
        expected_values = pine_reference_rma(sample_prices, length)

        for idx, price in enumerate(sample_prices):
            ctx.new_bar(open=price, high=price, low=price, close=price, volume=1.0)
            exp = expected_values[idx]
            act = rma_series[0]
            if math.isnan(exp):
                assert math.isnan(act)
            else:
                assert act == pytest.approx(exp, abs=1e-6)

    @pytest.mark.parametrize("invalid_length", [0, -1])
    def test_rma_invalid_length_raises_value_error(self, invalid_length: int):
        ctx = ExecutionContext()
        with pytest.raises(ValueError):
            ta.rma(ctx.close, invalid_length)


# =====================================================================
# Unit Tests: ta.rsi (engine/runtime/ta.py)
# =====================================================================

class TestTaRsi:
    def test_rsi_warmup_returns_nan_until_seed_bar(self):
        """For length 3, 3 change deltas are needed: bar 1, 2, 3. Bars 0..2 are NaN."""
        ctx = ExecutionContext()
        rsi_3 = ta.rsi(ctx.close, 3)

        prices = [100.0, 102.0, 101.0, 104.0]
        for idx, p in enumerate(prices):
            ctx.new_bar(open=p, high=p, low=p, close=p, volume=1.0)
            if idx < 3:
                assert math.isnan(rsi_3[0])
            else:
                assert not math.isnan(rsi_3[0])

    def test_rsi_hand_calculated_values(self):
        """
        Prices:
        Bar 0: 100.0 (no change)
        Bar 1: 102.0 -> u=2, d=0
        Bar 2: 101.0 -> u=0, d=1
        Bar 3: 104.0 -> u=3, d=0
          SMA of u: (2+0+3)/3 = 5/3
          SMA of d: (0+1+0)/3 = 1/3
          RS = (5/3) / (1/3) = 5
          RSI = 100 - (100 / (1 + 5)) = 100 - 16.666667 = 83.33333333

        Bar 4: 103.0 -> u=0, d=1
          RMA(u) = (1/3)*0 + (2/3)*(5/3) = 10/9
          RMA(d) = (1/3)*1 + (2/3)*(1/3) = 5/9
          RS = (10/9) / (5/9) = 2.0
          RSI = 100 - (100 / (1 + 2)) = 66.66666667
        """
        ctx = ExecutionContext()
        rsi_3 = ta.rsi(ctx.close, 3)

        prices = [100.0, 102.0, 101.0, 104.0, 103.0]
        evaluated = []
        for p in prices:
            ctx.new_bar(open=p, high=p, low=p, close=p, volume=1.0)
            evaluated.append(rsi_3[0])

        assert math.isnan(evaluated[0])
        assert math.isnan(evaluated[1])
        assert math.isnan(evaluated[2])
        assert evaluated[3] == pytest.approx(83.33333333, abs=1e-6)
        assert evaluated[4] == pytest.approx(66.66666667, abs=1e-6)

    def test_rsi_monotonically_increasing_prices_reaches_100(self):
        """When all price changes are positive, RMA(d) is 0, Pine Script resolves RSI = 100."""
        ctx = ExecutionContext()
        rsi_5 = ta.rsi(ctx.close, 5)

        for i in range(10):
            price = 100.0 + (i * 2.0)
            ctx.new_bar(open=price, high=price, low=price, close=price, volume=1.0)
            if i >= 5:
                assert rsi_5[0] == pytest.approx(100.0, abs=1e-6)

    def test_rsi_monotonically_decreasing_prices_reaches_0(self):
        """When all price changes are negative, RMA(u) is 0, Pine Script resolves RSI = 0."""
        ctx = ExecutionContext()
        rsi_5 = ta.rsi(ctx.close, 5)

        for i in range(10):
            price = 200.0 - (i * 2.0)
            ctx.new_bar(open=price, high=price, low=price, close=price, volume=1.0)
            if i >= 5:
                assert rsi_5[0] == pytest.approx(0.0, abs=1e-6)

    def test_rsi_flat_prices_yields_50(self):
        """When price is completely constant, both RMA(u) and RMA(d) are 0 -> RSI = 50."""
        ctx = ExecutionContext()
        rsi_5 = ta.rsi(ctx.close, 5)

        for _ in range(10):
            ctx.new_bar(open=100.0, high=100.0, low=100.0, close=100.0, volume=1.0)

        assert rsi_5[0] == pytest.approx(50.0, abs=1e-6)

    def test_rsi_historical_indexing(self):
        ctx = ExecutionContext()
        rsi_3 = ta.rsi(ctx.close, 3)

        prices = [100.0, 102.0, 101.0, 104.0, 103.0]
        for p in prices:
            ctx.new_bar(open=p, high=p, low=p, close=p, volume=1.0)

        # Bar 4 is current, Bar 3 is previous
        assert rsi_3[0] == pytest.approx(66.66666667, abs=1e-6)
        assert rsi_3[1] == pytest.approx(83.33333333, abs=1e-6)
        assert math.isnan(rsi_3[2])

    def test_rsi_precision_against_pine_reference(self, sample_prices: List[float]):
        """Evaluates ta.rsi across sequential bars against Pine Script v5 RMA reference within 1e-6."""
        ctx = ExecutionContext()
        length = 14
        rsi_series = ta.rsi(ctx.close, length)
        expected_values = pine_reference_rsi(sample_prices, length)

        for idx, price in enumerate(sample_prices):
            ctx.new_bar(open=price, high=price, low=price, close=price, volume=1.0)
            exp = expected_values[idx]
            act = rsi_series[0]
            if math.isnan(exp):
                assert math.isnan(act)
            else:
                assert act == pytest.approx(exp, abs=1e-6)

    @pytest.mark.parametrize("invalid_length", [0, -1, -14])
    def test_rsi_invalid_length_raises_value_error(self, invalid_length: int):
        ctx = ExecutionContext()
        with pytest.raises(ValueError):
            ta.rsi(ctx.close, invalid_length)


# =====================================================================
# Integrated Acceptance Test: Sequential Runtime Evaluation
# =====================================================================

class TestIntegratedPineRuntime:
    def test_integrated_ohlcv_sequential_evaluation(self, sample_prices: List[float]):
        """
        Acceptance Criteria:
        Given an execution context initialized with OHLCV data series,
        When evaluating ta.sma, ta.ema, and ta.rsi functions across sequential bars,
        Then historical values resolve matching Pine Script v5 smoothing and RMA formulas
        within float precision tolerance (10^-6).
        """
        ctx = ExecutionContext()
        sma_14 = ta.sma(ctx.close, 14)
        ema_14 = ta.ema(ctx.close, 14)
        rsi_14 = ta.rsi(ctx.close, 14)

        expected_sma = pine_reference_sma(sample_prices, 14)
        expected_ema = pine_reference_ema(sample_prices, 14)
        expected_rsi = pine_reference_rsi(sample_prices, 14)

        for i, price in enumerate(sample_prices):
            # Feed bar into sequential runtime
            ctx.new_bar(
                open=price - 0.5,
                high=price + 1.0,
                low=price - 1.0,
                close=price,
                volume=100.0 + i,
                time=1672531200 + (i * 3600),
            )

            # SMA Assertion
            exp_s = expected_sma[i]
            if math.isnan(exp_s):
                assert math.isnan(sma_14[0])
            else:
                assert sma_14[0] == pytest.approx(exp_s, abs=1e-6)

            # EMA Assertion
            exp_e = expected_ema[i]
            if math.isnan(exp_e):
                assert math.isnan(ema_14[0])
            else:
                assert ema_14[0] == pytest.approx(exp_e, abs=1e-6)

            # RSI Assertion
            exp_r = expected_rsi[i]
            if math.isnan(exp_r):
                assert math.isnan(rsi_14[0])
            else:
                assert rsi_14[0] == pytest.approx(exp_r, abs=1e-6)

        # Confirm historical lookback resolves accurately on the last bar
        last_idx = len(sample_prices) - 1
        for lookback in range(10):
            target_idx = last_idx - lookback
            assert sma_14[lookback] == pytest.approx(expected_sma[target_idx], abs=1e-6)
            assert ema_14[lookback] == pytest.approx(expected_ema[target_idx], abs=1e-6)
            assert rsi_14[lookback] == pytest.approx(expected_rsi[target_idx], abs=1e-6)