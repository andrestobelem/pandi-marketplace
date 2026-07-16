from pandi_launchpad.hooks import resolve_event


def test_resolve_event_done_is_static_green():
    assert resolve_event("done") == ("green", "static")


def test_resolve_event_attention_is_pulsing_red():
    assert resolve_event("attention") == ("red", "pulse")


def test_resolve_event_unknown_falls_back_to_flashing_white():
    assert resolve_event("something-unrecognised") == ("white", "flash")
