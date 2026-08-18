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
        "This ComfyUI node cleans and optimizes your text prompts by removing extra spaces, collapsing repeated punctuation, converting bracketed pairs like ((text)) or [[text]] into standardized weight tags such as (text:1.21) or [text:0.81], and removing spaces adjacent to parentheses/brackets (e.g., ( girl) → (girl), [boy ] → [boy])."
        "It also automatically inserts a space after commas or periods when they are followed directly by letters or numbers."
        "The interface includes a 'Format prompt' button for instant client-side processing, along with an 'Undo' feature to revert changes without losing your original text."
    )
                
    def execute(self, text):
        return (text,)
