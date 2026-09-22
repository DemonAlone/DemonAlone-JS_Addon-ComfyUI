class DA_ResolutionSelector:
    STEPS_LIST = [1, 4, 8, 16, 32, 64, 128, 256]
    
    # Fixed resolution preset
    RESOLUTION_PRESETS = [
        "Custom / None",
        "1:1 Square (1024×1024)",
        "3:4 Portrait (768×1024)",
        "4:5 Portrait (915×1144)",
        "5:12 Portrait (640×1536)",
        "7:9 Portrait (896×1152)",
        "9:16 Portrait (768×1344)",
        "13:19 Portrait (832×1216)",
        "3:2 Landscape (1254×836)",
        "4:3 Landscape (1024×768)",
        "16:9 Landscape (1344×768)",
        "21:9 Landscape (1536×640)"
    ]

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "width": ("INT", {"default": 1024, "min": 64, "max": 32768, "step": 1}),
                "height": ("INT", {"default": 1024, "min": 64, "max": 32768, "step": 1}),
                "step_size": ([str(x) for x in s.STEPS_LIST], {"default": "16", "tooltip": "Divisor to snap dimensions to a multiple of this value (e.g., 16)."}),
                "resolution_preset": (s.RESOLUTION_PRESETS, {"default": "1:1 Square (1024×1024)", "tooltip": "Quick base resolution preset."}),
                "priority_mode": (["Strict Step (Snap to Grid)", "Strict Aspect (Preserve Ratio)"], {"default": "Strict Step (Snap to Grid)", "tooltip": "Choose whether step alignment or exact aspect ratio takes precedence."}),
                "scale_mult": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 4.0, "step": 0.1, "tooltip": "Uniform multiplier applied directly to width and height."}),
                "scale_mp": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 16.0, "step": 0.1, "tooltip": "Target megapixel count."}),
                "align_to_step": ("BOOLEAN", {"default": False, "tooltip": "If True, snaps dimensions to step_size."}),
            },
            "optional": {
                "image": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    FUNCTION = "apply_scaling"
    CATEGORY = "utils/resolution"
    DESCRIPTION = "Utility node for resolution management with quick base presets, step snapping, and multipliers."

    def apply_scaling(self, width, height, step_size, resolution_preset, priority_mode, scale_mult, scale_mp, align_to_step, image=None):
        step = int(step_size) if align_to_step else 1
        w, h = width, height
        if step > 1 and "Strict Step" in priority_mode:
            w = round(w / step) * step
            h = round(h / step) * step
                
        return (int(max(64, w)), int(max(64, h)))