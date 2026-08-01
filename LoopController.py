class SimpleLoopController:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "total": ("INT", {"default": 1, "min": 1, "max": 100, "step": 1}),
                "current_step": ("INT", {"default": 0, "min": 0, "max": 100, "step": 1}),
            },
            "optional": {
                "any_input": ("*", {}),
            }
        }

    RETURN_TYPES = ("*", "INT")
    RETURN_NAMES = ("output", "current_step")
    FUNCTION = "control_loop"
    DESCRIPTION = "This node automates sequential task execution in ComfyUI by managing a configurable step counter and automatically queuing subsequent prompts until completion. It includes a dedicated abort button to safely interrupt the loop and reset progress when needed. The controller handles all state tracking and UI updates, enabling reliable batch processing without manual intervention."
    CATEGORY = "utils/loop"

    def control_loop(self, total, current_step, any_input=None):
        print(f"[LoopController] Step {current_step} of {total}")
        
        next_step = current_step + 1
        
        if next_step < total:
            ui_step = next_step
            is_finished = 0
        else:
            ui_step = 0
            is_finished = 1
            print(f"[LoopController] Loop finished. Counter reset to 0.")

        return {
            "result": (any_input, current_step),
            "ui": {
                "next_step": [ui_step],
                "is_finished": [is_finished]
            }
        }
