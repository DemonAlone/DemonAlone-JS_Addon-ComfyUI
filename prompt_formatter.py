import comfy

class DA_PromptFormatter:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {
                    "multiline": True,
                    "default": "",
                    "dynamicPrompts": False
                }),
            }
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "execute"
    CATEGORY = "utils/prompt"
    DESCRIPTION = (
        "This node optimizes text prompts by cleaning spacing, punctuation, and line breaks while converting bracketed weights into standardized formats."
        "It also provides instant formatting and undo features for seamless prompt editing."
    )
                
    def execute(self, text):
        return (text,)
