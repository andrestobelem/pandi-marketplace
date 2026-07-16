import pytest

from pandi_launchpad.device import (
    COLORS,
    FLASH,
    PULSE,
    RGB,
    colourspec,
    led_sysex,
    note_to_coord,
    pad_note,
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
