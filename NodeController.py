# based on AUNMultiUniversal from https://github.com/loz2754/AUN-ComfyUI-Nodes , MIT.
import re
from server import PromptServer

class DA_NodeController:
    @classmethod
    def INPUT_TYPES(cls):
        inputs = {
            "required": {},
            "optional": {
                "mode": (["Bypass", "Mute"], {
                    "default": "Bypass",
                    "tooltip": "Choose how to disable nodes: Bypass (🔴) or Mute (🔇)."
                }),
                "slot_count": ("INT", {
                    "default": 3, "min": 1, "max": 20, "step": 1,
                    "tooltip": "Number of control slots to show (1-20)."
                }),
                "toggle_restriction": (["default", "max one", "always one"], {
                    "default": "default",
                    "tooltip": "Logic for toggles: 'max one' allows only one active, 'always one' ensures at least one is active."
                }),
                "AllSwitch": ("BOOLEAN", {
                    "default": False,
                    "label_on": "All 🟢",
                    "label_off": "Individual",
                    "tooltip": "ON = all groups active (🟢). OFF = use individual group switches."
                }),
                "show_AllSwitch": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "Show the AllSwitch toggle even in compact mode."
                }),
            },
            "hidden": {"unique_id": "UNIQUE_ID"}
        }

        def slot_tooltip(text, slot_index):
            return text if slot_index == 1 else ""

        label_tooltip = "Descriptive label for slot 1 (other slots follow the same layout)."
        targets_tooltip = (
            "Target node IDs or Titles for slot 1 (comma or semicolon separated). "
            "Example: '123, 456' or 'upscale; denoise'."
        )
        switch_tooltip = "Toggle state for slot 1. 🟢 = active, 🔴 = controlled by mode."
        target_type_tooltip = "Targeting method for slot 1: ID (numeric) or Title (display name)."

        for i in range(1, 21):
            inputs["optional"][f"label_{i}"] = ("STRING", {
                "default": "",
                "tooltip": slot_tooltip(label_tooltip, i)
            })
            inputs["optional"][f"targets_{i}"] = ("STRING", {
                "default": "0",
                "tooltip": slot_tooltip(targets_tooltip, i)
            })
            inputs["optional"][f"switch_{i}"] = ("BOOLEAN", {
                "default": False,
                "label_on": "Active 🟢",
                "label_off": "Bypass 🔴",
                "tooltip": slot_tooltip(switch_tooltip, i)
            })
            inputs["optional"][f"target_type_{i}"] = (["ID", "Title"], {
                "default": "ID",
                "tooltip": slot_tooltip(target_type_tooltip, i)
            })

        return inputs

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "execute"
    CATEGORY = "Node Control"
    OUTPUT_NODE = True
    DESCRIPTION = (
        "Use the context menu to switch between full and compact modes."
        "DA Node Controller: Consolidates Bypass and Mute logic into one dynamic node."
        "Set the mode and number of slots, then manage multiple node groups instantly."
    )

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return False

    @staticmethod
    def _compute_state_changes(mode):
        if mode == "Mute":
            return ["mute", "bypass"]
        else:
            return ["bypass", "mute"]

    def execute(self, mode="Bypass", slot_count=3, toggle_restriction="default", AllSwitch=False, unique_id=None, **kwargs):
        try:
            if slot_count == 1:
                AllSwitch = False

            state_changes = self._compute_state_changes(mode)

            id_states = {}
            title_states = {}

            for i in range(1, 21):
                if i <= slot_count:
                    switch = kwargs.get(f"switch_{i}", False) or AllSwitch
                    target_type = kwargs.get(f"target_type_{i}", "ID")
                    targets_str = kwargs.get(f"targets_{i}", "0")

                    if targets_str and targets_str != "0":
                        targets = [s.strip() for s in re.split(r'[,;]+', targets_str) if s.strip()]
                        for t in targets:
                            if target_type == "ID":
                                if id_states.get(t) is not True:
                                    id_states[t] = switch
                            else:
                                if title_states.get(t) is not True:
                                    title_states[t] = switch

            target_groups = []

            active_ids = [tid for tid, active in id_states.items() if active]
            inactive_ids = [tid for tid, active in id_states.items() if not active]
            active_titles = [t for t, active in title_states.items() if active]
            inactive_titles = [t for t, active in title_states.items() if not active]

            if active_ids:
                target_groups.append({"type": "ID", "targets": active_ids, "is_active": True})
            if inactive_ids:
                target_groups.append({"type": "ID", "targets": inactive_ids, "is_active": False})
            if active_titles:
                target_groups.append({"type": "Title", "targets": active_titles, "is_active": True})
            if inactive_titles:
                target_groups.append({"type": "Title", "targets": inactive_titles, "is_active": False})

            return ()

        except Exception as e:
            print(f"[DA_NodeController] Error: {e}")
            return ()