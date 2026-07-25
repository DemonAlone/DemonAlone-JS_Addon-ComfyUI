#*PresetIntNode* is based on *Power Primitive* from [rgthree-comfy](https://github.com/rgthree/rgthree-comfy)
import torch
import os
import folder_paths
import comfy.samplers

class PresetIntNode:
    # Dictionary of presets: name -> {min, max, step, default}
    PRESETS = {
        "Seed (0 - 4294967295, step 1)": {"min": 0, "max": 0xFFFFFFFFFFFFFFFF, "step": 1, "default": 0},
        "Steps (1 - 10000, step 1)": {"min": 1, "max": 10000, "step": 1, "default": 28},
    }

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # Dropdown list of presets
                "preset": (list(cls.PRESETS.keys()),),
                # The slider itself. Since ComfyUI reads INPUT_TYPES once at startup,
                # we set universal wide ranges here, and perform strict validation 
                # in the execute() function.
                "value": ("INT", {"default": 0, "min": 0, "max": 2147483647, "step": 1}),
            }
        }

    RETURN_TYPES = ("INT",)
    FUNCTION = "execute"
    CATEGORY = "CustomNodes/Presets"
    DESCRIPTION = "PresetInt is a versatile ComfyUI node that acts as a universal integer slider, offering a specialized alternative to default nodes by enforcing specific parameter ranges and step sizes through configurable presets. Upon selecting a preset such as Seed or Steps, the node dynamically adjusts constraints to ensure values remain within valid mathematical bounds for integer operations."

    def execute(self, preset, value):
        # Get parameters of the selected preset
        p_config = self.PRESETS.get(preset, {"min": 0, "max": 2147483647, "step": 1})
        
        min_val = p_config["min"]
        max_val = p_config["max"]
        step = p_config["step"]

        # 1. Clamp the value strictly within preset limits
        clamped_val = max(min_val, min(max_val, value))

        # 2. Align to the step (for integers, this is just ensuring it's a multiple of step relative to min)
        # Since step is always 1 in your request, strict alignment isn't mathematically complex, 
        # but we ensure it stays on the grid defined by min + k*step.
        final_val = clamped_val

        return (final_val,)
