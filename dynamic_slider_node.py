class DA_DynamicSliderNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "type": (["INT", "FLOAT"], {"default": "FLOAT"}),
                # Group for INT
                "value_int": ("INT", {"default": 1, "min": -1e9, "max": 1e9, "step": 1}),
                "min_int": ("INT", {"default": 0, "min": -1e9, "max": 1e9, "step": 1}),
                "max_int": ("INT", {"default": 100, "min": -1e9, "max": 1e9, "step": 1}),
                "step_int": ("INT", {"default": 1, "min": 1, "step": 1}),
                # Group for FLOAT
                "value_float": ("FLOAT", {"default": 0.5, "min": -1e9, "max": 1e9, "step": 0.01}),
                "min_float": ("FLOAT", {"default": 0.0, "min": -1e9, "max": 1e9, "step": 0.01}),
                "max_float": ("FLOAT", {"default": 1.0, "min": -1e9, "max": 1e9, "step": 0.01}),
                "step_float": ("FLOAT", {"default": 0.01, "min": 0.0, "max": 1e9, "step": 0.01}),
            }
        }

    RETURN_TYPES = ("*",)
    RETURN_NAMES = ("value",)
    FUNCTION = "execute"
    CATEGORY = "CustomNodes/Utils"
    DESCRIPTION = (
        "Dual-mode Slider with separate controls for INT and FLOAT. IMPORTANT! The node is doesn't work inside subgraphs."
    )

    def execute(self, type, value_int, min_int, max_int, step_int, value_float, min_float, max_float, step_float):
        if type == "INT":
            # Logic for integers
            if min_int >= max_int: max_int = min_int + 1
            if step_int < 1: step_int = 1
            
            clamped = max(min_int, min(max_int, value_int))
            steps = round((clamped - min_int) / step_int)
            final_val = int(min_int + (steps * step_int))
            return (final_val,)
            
        else:
            # Logic for floats
            if min_float >= max_float: max_float = min_float + step_float
            if step_float <= 0: step_float = 0.01
            
            clamped = max(min_float, min(max_float, value_float))
            steps = round((clamped - min_float) / step_float)
            final_val = min_float + (steps * step_float)
            
            # Round to a reasonable precision to avoid 0.3000000004
            precision = max(0, -int(f"{step_float:e}".split('e-')[1]) if 'e-' in f"{step_float:e}" else 0) + 1
            return (round(final_val, min(precision, 6)),)
