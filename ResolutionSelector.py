class DA_ResolutionSelector:
    STEPS_LIST = [1, 4, 8, 16, 32, 64, 128, 256]
    PRESETS_LIST = ["144p", "240p", "360p", "480p", "720p", "1080p", "1440p", "2160p (4K)"]

    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "width": ("INT", {"default": 1376, "min": 64, "max": 32768, "step": 1}),
                "height": ("INT", {"default": 768, "min": 64, "max": 32768, "step": 1}),
                "step_size": ([str(x) for x in s.STEPS_LIST], {"default": "16",  "tooltip": "Divisor to snap dimensions to a multiple of this value (e.g., 16)."}),
                "scale_mult": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 4.0, "step": 0.1, "tooltip": "Uniform multiplier applied directly to width and height."}),
                "scale_preset": (s.PRESETS_LIST, {"default": "1080p", "tooltip": "Target resolution preset (e.g., 1080p) to calculate new dimensions based on aspect ratio."}),
                "scale_mp": ("FLOAT", {"default": 1.0, "min": 0.1, "max": 16.0, "step": 0.1, "tooltip": "Target megapixel count; calculates scaling factor needed to reach this pixel area."}),
                "align_to_step": ("BOOLEAN", {"default": True, "tooltip": "If True, snaps the final width and height to the nearest multiple of step_size."}),
            },
            "optional": {
                "image": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    FUNCTION = "apply_scaling"
    CATEGORY = "utils/resolution"
    DESCRIPTION = (
        "This utility node dynamically calculates and snaps image/latent resolutions based on custom step divisors, scaling multipliers, or target presets like 1080p or 4K."
        "It also supports direct megapixel targeting, aspect-ratio preservation, and optional dimension swapping for flexible workflow integration."
    )

    def apply_scaling(self, width, height, step_size, scale_mult, scale_preset, scale_mp, align_to_step, image=None):
        step = int(step_size) if align_to_step else 1
        if step > 1:
            w = round(width / step) * step
            h = round(height / step) * step
        else:
            w, h = width, height
        return (int(w), int(h))
