class DA_NodeController_V2:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {},
        }

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "execute"
    CATEGORY = "Node Control"
    OUTPUT_NODE = True
    DESCRIPTION = (
        "DA Node Controller V2: Pure JS/Properties architecture. "
        "Use context menu to switch between Full and Compact modes."
    )

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return False

    def execute(self):
        return ()
