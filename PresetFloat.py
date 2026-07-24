#*PresetFloatNode* is based on *Power Primitive* from [rgthree-comfy](https://github.com/rgthree/rgthree-comfy)
import torch
import os
import folder_paths
import comfy.samplers

class PresetFloatNode:
    # Dictionary of presets: name -> {min, max, step, default}
    PRESETS = {
        "Denoise (0.0 - 1.0, step 0.01)": {"min": 0.0, "max": 1.0, "step": 0.01, "default": 0.5},
        "CFG Scale (1.0 - 30.0, step 0.5)": {"min": 1.0, "max": 30.0, "step": 0.5, "default": 8.0},
        "FPS (1 - 120, step 1)": {"min": 1.0, "max": 120.0, "step": 1.0, "default": 24.0},
        "Strength (0.0 - 2.0, step 0.05)": {"min": 0.0, "max": 2.0, "step": 0.05, "default": 1.0},
    }

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # Dropdown list of presets
                "preset": (list(cls.PRESETS.keys()),),
                # The slider itself. Since ComfyUI reads INPUT_TYPES once at startup,
                # we set universal wide ranges here, and perform strict validation 
                # and rounding in the execute() function.
                "value": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1000.0, "step": 0.001}),
            }
        }

    RETURN_TYPES = ("FLOAT",)
    FUNCTION = "execute"
    CATEGORY = "CustomNodes/Presets"
    DESCRIPTION = "PresetFloat is a versatile ComfyUI node that acts as a universal float slider, offering a more specialized alternative to the default Primitive nodes by enforcing specific parameter ranges and step sizes through configurable presets. Upon selecting a preset such as Denoise or CFG Scale, the node dynamically adjusts the slider's constraints and precision to ensure values remain mathematically aligned with the intended use case. This smart validation prevents floating-point errors and maintains consistency across different workflow parameters without requiring manual range adjustments."
    

    def execute(self, preset, value):
        # Get parameters of the selected preset
        p_config = self.PRESETS.get(preset, {"min": 0.0, "max": 1000.0, "step": 0.01})
        
        min_val = p_config["min"]
        max_val = p_config["max"]
        step = p_config["step"]

        # 1. Clamp the value strictly within preset limits
        clamped_val = max(min_val, min(max_val, value))

        # 2. Mathematically align to the step (to avoid floating point tails)
        decimals = len(str(step).split(".")[1]) if "." in str(step) else 0
        final_val = round(round((clamped_val - min_val) / step) * step + min_val, decimals)

        return (final_val,)
