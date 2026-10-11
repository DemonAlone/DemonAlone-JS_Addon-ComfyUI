import torch
import itertools
from nodes import PreviewImage

class DA_ImageComparer:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "image_a": ("IMAGE",),
                "image_b": ("IMAGE",),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "compare_images"
    CATEGORY = "MyCustomExtension/Image"
    OUTPUT_NODE = True
    DESCRIPTION = (
            "Node that compares two images or batches by displaying them side-by-side in an adjustable split view while passing the original input through as a reroute output."
    )

    def compare_images(self, image_a=None, image_b=None):
        # 1. traffic protection for mute/bypass
        if image_a is None and image_b is None:
            return {"ui": {"comparer_data": []}, "result": (torch.zeros((1, 1, 1, 3)),)}

        # End-to-end Reroute (returning the untouched original input)
        pure_output = image_a if image_a is not None else image_b

        # Plugs in case only one of the inputs is supplied
        preview_a = image_a if image_a is not None else image_b
        preview_b = image_b if image_b is not None else image_a

        preview_node = PreviewImage()

        # 2. instant saving of entire batches
        res_a = preview_node.save_images(preview_a, filename_prefix="comp_a.")["ui"]["images"]
        res_b = preview_node.save_images(preview_b, filename_prefix="comp_b.")["ui"]["images"]

        # 3. assembling pairs based on a larger batch (Via zip_longest)
        processed_images = []
        # fillvalue=None ensures that we see if the picture has no match
        for img_a, img_b in itertools.zip_longest(res_a, res_b, fillvalue=None):
            #If batch B runs out of frames, duplicate the last available frame from B
            # (or use the current one from A so that the preview is not empty)
            actual_a = img_a if img_a is not None else img_b
            actual_b = img_b if img_b is not None else img_a

            processed_images.append({
                "file_a": f"/view?filename={actual_a['filename']}&type={actual_a['type']}&subfolder={actual_a['subfolder']}",
                "file_b": f"/view?filename={actual_b['filename']}&type={actual_b['type']}&subfolder={actual_b['subfolder']}"
            })

        return {
            "ui": {"comparer_data": processed_images}, 
            "result": (pure_output,)
        }
