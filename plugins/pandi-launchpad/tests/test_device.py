import pytest

from pandi_launchpad.device import (
    COLORS,
    FLASH,
    PULSE,
    RGB,
    colourspec,
    column_cells,
    led_sysex,
    note_to_coord,
    pad_note,
    parse_color,
    progress_bar_cells,
)


def test_pad_note_corners():
    assert pad_note(1, 1) == 11
    assert pad_note(8, 1) == 18
    assert pad_note(1, 8) == 81
    assert pad_note(8, 8) == 88


@pytest.mark.parametrize("col,row", [(0, 1), (9, 1), (1, 0), (1, 9)])
def test_pad_note_rejects_out_of_range(col, row):
    with pytest.raises(ValueError):
        pad_note(col, row)


def test_note_to_coord_roundtrip():
    for col in range(1, 9):
        for row in range(1, 9):
            assert note_to_coord(pad_note(col, row)) == (col, row)


def test_colourspec_static_uses_exact_rgb():
    lighting_type, index, payload = colourspec(1, 1, "red", "static")
    assert lighting_type == RGB
    assert index == 11
    assert payload == COLORS["red"]["rgb"]


def test_colourspec_flash_uses_palette_pair():
    lighting_type, index, payload = colourspec(8, 8, "green", "flash")
    assert lighting_type == FLASH
    assert index == 88
    assert payload == (COLORS["green"]["palette"], 0)


def test_colourspec_pulse_uses_single_palette_value():
    lighting_type, index, payload = colourspec(1, 1, "blue", "pulse")
    assert lighting_type == PULSE
    assert payload == (COLORS["blue"]["palette"],)


def test_colourspec_unknown_mode_raises():
    with pytest.raises(ValueError):
        colourspec(1, 1, "red", "sparkle")


def test_led_sysex_batches_all_specs_into_one_message():
    specs = [colourspec(1, 1, "red", "static"), colourspec(2, 1, "green", "pulse")]
    msg = led_sysex(specs)
    assert msg.type == "sysex"
    # header(5) + command(1) + spec1(2+3) + spec2(2+1)
    assert len(msg.data) == 5 + 1 + 5 + 3


def test_parse_color_named_returns_its_colors_entry():
    assert parse_color("red", "static") == COLORS["red"]


@pytest.mark.parametrize(
    "hex_color,expected_rgb",
    [
        ("#ff0000", (127, 0, 0)),
        ("#00ff00", (0, 127, 0)),
        ("#0000ff", (0, 0, 127)),
        ("#ffffff", (127, 127, 127)),
        ("#000000", (0, 0, 0)),
    ],
)
def test_parse_color_hex_scales_0_255_to_0_127(hex_color, expected_rgb):
    assert parse_color(hex_color, "static")["rgb"] == expected_rgb


@pytest.mark.parametrize("mode", ["flash", "pulse"])
def test_parse_color_hex_rejects_non_static_modes(mode):
    with pytest.raises(ValueError):
        parse_color("#ff0000", mode)


def test_parse_color_rejects_malformed_hex():
    with pytest.raises(ValueError):
        parse_color("#fff", "static")


def test_parse_color_rejects_unknown_name():
    with pytest.raises(ValueError):
        parse_color("chartreuse", "static")


def test_column_cells_lists_all_8_rows_of_one_column():
    assert column_cells(3, "red") == [
        (3, 1, "red", "static"),
        (3, 2, "red", "static"),
        (3, 3, "red", "static"),
        (3, 4, "red", "static"),
        (3, 5, "red", "static"),
        (3, 6, "red", "static"),
        (3, 7, "red", "static"),
        (3, 8, "red", "static"),
    ]


def test_progress_bar_cells_covers_all_64_pads():
    assert len(progress_bar_cells(50, "red")) == 64


def test_progress_bar_cells_zero_percent_is_all_off():
    cells = progress_bar_cells(0, "red")
    assert all(color == "off" for _, _, color, _ in cells)


def test_progress_bar_cells_hundred_percent_is_all_filled():
    cells = progress_bar_cells(100, "red")
    assert all(color == "red" for _, _, color, _ in cells)


def test_progress_bar_cells_fifty_percent_fills_half():
    filled = [c for c in progress_bar_cells(50, "red") if c[2] == "red"]
    assert len(filled) == 32


def test_progress_bar_cells_clamps_out_of_range_percent():
    assert progress_bar_cells(-10, "red") == progress_bar_cells(0, "red")
    assert progress_bar_cells(150, "red") == progress_bar_cells(100, "red")
