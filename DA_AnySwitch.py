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

    def switch(self, **kwargs):
        # for the first filled input
        for key in sorted(kwargs.keys()):
            val = kwargs.get(key)
            if val is not None:
                return (val,)
        return (None,)