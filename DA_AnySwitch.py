class DA_AnySwitch:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "input_1": ("*",),
                "input_2": ("*",),
            }
        }

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("output",)
    FUNCTION = "switch"
    CATEGORY = "utils/switch"
    DESCRIPTION = (
        "A dynamic routing node that automatically detects the first active input and forwards its data to the output while dynamically resizing input slots as connections are made or removed."
        "It intelligently infers the output type from the connected inputs, enabling flexible logic flow for scenarios like conditional latent selection in workflows."
    )

    def switch(self, **kwargs):
        # for the first filled input
        for key in sorted(kwargs.keys()):
            val = kwargs.get(key)
            if val is not None:
                return (val,)
        return (None,)