import pytest
from src.charting.matrix import Matrix3x3
from src.charting.viewport import Viewport


class TestMatrix3x3:
    """Unit tests for low-level 3x3 transformation matrix operations."""

    def test_identity_matrix(self):
        mat = Matrix3x3.identity()
        expected = (
            (1.0, 0.0, 0.0),
            (0.0, 1.0, 0.0),
            (0.0, 0.0, 1.0),
        )
        assert mat.elements == expected

    def test_custom_elements_initialization(self):
        elements = (
            (2.0, 0.0, 5.0),
            (0.0, 3.0, 7.0),
            (0.0, 0.0, 1.0),
        )
        mat = Matrix3x3(elements)
        assert mat.elements == elements

    def test_invalid_matrix_dimensions(self):
        with pytest.raises(ValueError):
            Matrix3x3(((1.0, 0.0), (0.0, 1.0)))

    def test_matrix_vector_transform_point(self):
        # Scale by (2, 3) and translate by (10, 20)
        elements = (
            (2.0, 0.0, 10.0),
            (0.0, 3.0, 20.0),
            (0.0, 0.0, 1.0),
        )
        mat = Matrix3x3(elements)
        x_out, y_out = mat.transform_point(5.0, 4.0)

        assert x_out == pytest.approx(20.0)  # 2 * 5 + 10
        assert y_out == pytest.approx(32.0)  # 3 * 4 + 20

    def test_matrix_multiplication(self):
        # Scale matrix
        s = Matrix3x3((
            (2.0, 0.0, 0.0),
            (0.0, 3.0, 0.0),
            (0.0, 0.0, 1.0),
        ))
        # Translation matrix
        t = Matrix3x3((
            (1.0, 0.0, 10.0),
            (0.0, 1.0, 20.0),
            (0.0, 0.0, 1.0),
        ))
        combined = t.multiply(s)
        x_out, y_out = combined.transform_point(2.0, 2.0)

        # Expected: scale first (4, 6), then translate -> (14, 26)
        assert x_out == pytest.approx(14.0)
        assert y_out == pytest.approx(26.0)

    def test_matrix_inverse(self):
        elements = (
            (2.0, 0.0, 10.0),
            (0.0, 4.0, 20.0),
            (0.0, 0.0, 1.0),
        )
        mat = Matrix3x3(elements)
        inv = mat.inverse()

        # Multiplying mat by inv should yield identity
        prod = mat.multiply(inv)
        for r in range(3):
            for c in range(3):
                expected = 1.0 if r == c else 0.0
                assert prod.elements[r][c] == pytest.approx(expected, abs=1e-7)

    def test_matrix_inverse_singular_raises(self):
        singular = Matrix3x3((
            (1.0, 2.0, 3.0),
            (2.0, 4.0, 6.0),
            (0.0, 0.0, 0.0),
        ))
        with pytest.raises(ValueError):
            singular.inverse()


class TestViewportInitialization:
    """Unit tests verifying Viewport instantiation and boundary validation."""

    def test_valid_viewport_initialization(self):
        vp = Viewport(
            width=800.0,
            height=600.0,
            t_min=1000.0,
            t_max=2000.0,
            p_min=50.0,
            p_max=150.0,
        )
        assert vp.width == 800.0
        assert vp.height == 600.0
        assert vp.t_min == 1000.0
        assert vp.t_max == 2000.0
        assert vp.p_min == 50.0
        assert vp.p_max == 150.0
        assert isinstance(vp.projection_matrix, Matrix3x3)

    @pytest.mark.parametrize("w, h", [
        (0.0, 600.0),
        (-100.0, 600.0),
        (800.0, 0.0),
        (800.0, -50.0),
    ])
    def test_invalid_canvas_dimensions_raise(self, w, h):
        with pytest.raises(ValueError):
            Viewport(
                width=w,
                height=h,
                t_min=100.0,
                t_max=200.0,
                p_min=10.0,
                p_max=20.0,
            )

    @pytest.mark.parametrize("t_min, t_max", [
        (100.0, 100.0),
        (200.0, 100.0),
    ])
    def test_invalid_time_bounds_raise(self, t_min, t_max):
        with pytest.raises(ValueError):
            Viewport(
                width=800.0,
                height=600.0,
                t_min=t_min,
                t_max=t_max,
                p_min=10.0,
                p_max=20.0,
            )

    @pytest.mark.parametrize("p_min, p_max", [
        (50.0, 50.0),
        (100.0, 50.0),
    ])
    def test_invalid_price_bounds_raise(self, p_min, p_max):
        with pytest.raises(ValueError):
            Viewport(
                width=800.0,
                height=600.0,
                t_min=100.0,
                t_max=200.0,
                p_min=p_min,
                p_max=p_max,
            )


class TestViewportTransformations:
    """Acceptance criteria tests for world to screen coordinate transformations."""

    @pytest.fixture
    def default_viewport(self):
        # 1000px wide, 500px high
        # Time: 100.0 to 200.0 (delta = 100)
        # Price: 10.0 to 30.0 (delta = 20)
        return Viewport(
            width=1000.0,
            height=500.0,
            t_min=100.0,
            t_max=200.0,
            p_min=10.0,
            p_max=30.0,
        )

    def test_transform_corners(self, default_viewport):
        """Corner bounds must map to the exact canvas bounds with inverted Y."""
        # Top-Left of screen: min time, max price
        x, y = default_viewport.world_to_screen(timestamp=100.0, price=30.0)
        assert x == pytest.approx(0.0)
        assert y == pytest.approx(0.0)

        # Bottom-Left of screen: min time, min price
        x, y = default_viewport.world_to_screen(timestamp=100.0, price=10.0)
        assert x == pytest.approx(0.0)
        assert y == pytest.approx(500.0)

        # Top-Right of screen: max time, max price
        x, y = default_viewport.world_to_screen(timestamp=200.0, price=30.0)
        assert x == pytest.approx(1000.0)
        assert y == pytest.approx(0.0)

        # Bottom-Right of screen: max time, min price
        x, y = default_viewport.world_to_screen(timestamp=200.0, price=10.0)
        assert x == pytest.approx(1000.0)
        assert y == pytest.approx(500.0)

    def test_transform_midpoint(self, default_viewport):
        """Midpoint of ranges must map to the midpoint of the screen."""
        t_mid = (100.0 + 200.0) / 2.0
        p_mid = (10.0 + 30.0) / 2.0
        x, y = default_viewport.world_to_screen(timestamp=t_mid, price=p_mid)
        assert x == pytest.approx(500.0)
        assert y == pytest.approx(250.0)

    @pytest.mark.parametrize("t_val, p_val, expected_x, expected_y", [
        (125.0, 25.0, 250.0, 125.0),
        (150.0, 15.0, 500.0, 375.0),
        (175.0, 20.0, 750.0, 250.0),
    ])
    def test_transform_linear_interpolation(
        self, default_viewport, t_val, p_val, expected_x, expected_y
    ):
        x, y = default_viewport.world_to_screen(timestamp=t_val, price=p_val)
        assert x == pytest.approx(expected_x)
        assert y == pytest.approx(expected_y)

    def test_transform_outside_bounds(self, default_viewport):
        """Extrapolated points outside visible range should map consistently."""
        # 50 units before t_min (-50% width -> -500px)
        # 10 units above p_max (-50% height -> -250px)
        x, y = default_viewport.world_to_screen(timestamp=50.0, price=40.0)
        assert x == pytest.approx(-500.0)
        assert y == pytest.approx(-250.0)


class TestViewportDynamicUpdates:
    """Acceptance criteria tests for updating canvas dimensions and data bounds."""

    def test_update_dimensions(self):
        vp = Viewport(
            width=1000.0,
            height=500.0,
            t_min=0.0,
            t_max=100.0,
            p_min=0.0,
            p_max=50.0,
        )
        # Resize window
        vp.set_dimensions(width=2000.0, height=1000.0)

        assert vp.width == 2000.0
        assert vp.height == 1000.0

        # Verify matrix updated dynamically to new dimensions
        x, y = vp.world_to_screen(timestamp=100.0, price=50.0)
        assert x == pytest.approx(2000.0)
        assert y == pytest.approx(0.0)

        x, y = vp.world_to_screen(timestamp=50.0, price=25.0)
        assert x == pytest.approx(1000.0)
        assert y == pytest.approx(500.0)

    def test_update_dimensions_invalid_raises(self):
        vp = Viewport(
            width=1000.0,
            height=500.0,
            t_min=0.0,
            t_max=100.0,
            p_min=0.0,
            p_max=50.0,
        )
        with pytest.raises(ValueError):
            vp.set_dimensions(width=-500.0, height=300.0)

        with pytest.raises(ValueError):
            vp.set_dimensions(width=800.0, height=0.0)

    def test_update_data_bounds(self):
        vp = Viewport(
            width=1000.0,
            height=500.0,
            t_min=0.0,
            t_max=100.0,
            p_min=0.0,
            p_max=50.0,
        )
        # Pan and Zoom: shift time and price ranges
        vp.set_bounds(t_min=500.0, t_max=1500.0, p_min=100.0, p_max=300.0)

        assert vp.t_min == 500.0
        assert vp.t_max == 1500.0
        assert vp.p_min == 100.0
        assert vp.p_max == 300.0

        # Top-left corner of new bounds
        x, y = vp.world_to_screen(timestamp=500.0, price=300.0)
        assert x == pytest.approx(0.0)
        assert y == pytest.approx(0.0)

        # Bottom-right corner of new bounds
        x, y = vp.world_to_screen(timestamp=1500.0, price=100.0)
        assert x == pytest.approx(1000.0)
        assert y == pytest.approx(500.0)

    def test_update_data_bounds_invalid_raises(self):
        vp = Viewport(
            width=1000.0,
            height=500.0,
            t_min=0.0,
            t_max=100.0,
            p_min=0.0,
            p_max=50.0,
        )
        with pytest.raises(ValueError):
            vp.set_bounds(t_min=200.0, t_max=100.0, p_min=0.0, p_max=50.0)

        with pytest.raises(ValueError):
            vp.set_bounds(t_min=0.0, t_max=100.0, p_min=50.0, p_max=50.0)


class TestViewportInverseTransform:
    """Tests for mapping screen coordinates (pixels) back to world coordinates."""

    def test_screen_to_world_corners(self):
        vp = Viewport(
            width=1200.0,
            height=800.0,
            t_min=1600000000.0,
            t_max=1600086400.0,
            p_min=25000.0,
            p_max=26000.0,
        )
        # Top-Left screen (0, 0) -> (t_min, p_max)
        t, p = vp.screen_to_world(x=0.0, y=0.0)
        assert t == pytest.approx(1600000000.0)
        assert p == pytest.approx(26000.0)

        # Bottom-Right screen (W, H) -> (t_max, p_min)
        t, p = vp.screen_to_world(x=1200.0, y=800.0)
        assert t == pytest.approx(1600086400.0)
        assert p == pytest.approx(25000.0)

    def test_roundtrip_transformation_consistency(self):
        vp = Viewport(
            width=1920.0,
            height=1080.0,
            t_min=1704067200.0,
            t_max=1704153600.0,
            p_min=42000.50,
            p_max=44500.75,
        )
        original_t = 1704100000.0
        original_p = 43250.25

        x, y = vp.world_to_screen(original_t, original_p)
        reconstructed_t, reconstructed_p = vp.screen_to_world(x, y)

        assert reconstructed_t == pytest.approx(original_t, rel=1e-9)
        assert reconstructed_p == pytest.approx(original_p, rel=1e-9)


class TestViewportNegativeAndLargeRanges:
    """Edge cases: negative prices (e.g. commodities/spreads), high precision."""

    def test_negative_price_range(self):
        # E.g., energy futures spread trading at negative prices
        vp = Viewport(
            width=800.0,
            height=400.0,
            t_min=0.0,
            t_max=100.0,
            p_min=-50.0,
            p_max=-10.0,
        )
        # p_max (-10.0) is top (0 px), p_min (-50.0) is bottom (400 px)
        x_min, y_max_p = vp.world_to_screen(timestamp=0.0, price=-10.0)
        assert x_min == pytest.approx(0.0)
        assert y_max_p == pytest.approx(0.0)

        x_max, y_min_p = vp.world_to_screen(timestamp=100.0, price=-50.0)
        assert x_max == pytest.approx(800.0)
        assert y_min_p == pytest.approx(400.0)

        # Zero crossing in screen coordinates
        # -30.0 is the midpoint between -50 and -10
        _, y_mid = vp.world_to_screen(timestamp=50.0, price=-30.0)
        assert y_mid == pytest.approx(200.0)

    def test_high_precision_crypto_penny_asset(self):
        # E.g., micro-cap or meme coin pricing: 0.00001200 to 0.00001800
        vp = Viewport(
            width=1000.0,
            height=500.0,
            t_min=1_000_000.0,
            t_max=2_000_000.0,
            p_min=0.000012,
            p_max=0.000018,
        )
        x, y = vp.world_to_screen(timestamp=1_500_000.0, price=0.000015)
        assert x == pytest.approx(500.0)
        assert y == pytest.approx(250.0)