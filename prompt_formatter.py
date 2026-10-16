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
            },
            "optional": {
                "text_in": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    FUNCTION = "execute"
    CATEGORY = "utils/prompt"
    DESCRIPTION = (
        "This node optimizes text prompts by cleaning spacing, punctuation, and line breaks while converting bracketed weights into standardized formats. "
        "It also provides instant formatting and undo features for seamless prompt editing."
    )
                
    def execute(self, text, text_in=None):
        # If the main text widget is empty, but text_in is connected, use it.
        # This allows you to extract text, format it in the text widget and send it out already processed.
        if (not text or not text.strip()) and text_in is not None and text_in != "":
            text = text_in
            
        return (text,)
