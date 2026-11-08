"""Smart Dictation agent-side registration; importing performs no I/O."""


def register(ctx):
    ctx.register_auxiliary_task(
        "smart_dictation_correction",
        display_name="Smart Dictation correction",
        description="Correct a dictated transcript without tools.",
        defaults={"provider": "auto", "timeout": 20},
    )
