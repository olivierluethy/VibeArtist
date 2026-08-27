# Face-detection model — provenance & license

## `blazeface.onnx`

- **Model:** MediaPipe **BlazeFace short-range** face detector (Google Research), exported to ONNX.
- **Source:** [`unity/inference-engine-blaze-face`](https://huggingface.co/unity/inference-engine-blaze-face) on Hugging Face.
- **Direct URL:** `https://huggingface.co/unity/inference-engine-blaze-face/resolve/main/models/blaze_face_short_range.onnx`
- **License:** **Apache-2.0** (declared in the model card's YAML front-matter; the repo ships no standalone
  `LICENSE` file — recorded caveat). Constraint held: the committed model license is Apache-2.0/MIT.
- **Size:** 418,465 bytes
- **SHA-256:** `587fa34c93de9a523e691669d2405671d67faad86e595e9a63c6d3db401f18f4`
- **Format:** ONNX (tf2onnx-converted, opset 13).

### I/O contract (verified against the graph)

| Tensor | Name | Shape | Notes |
|---|---|---|---|
| input | `input` | `[1,128,128,3]` | NHWC, RGB, normalize `px/127.5 − 1` → [-1,1] |
| output | `regressors` | `[1,896,16]` | raw box `[xc,yc,w,h]` + 6 keypoints, `reverse_output_order` |
| output | `classificators` | `[1,896,1]` | raw pre-sigmoid scores |

Consumed by `lib/engine1/blazeface.ts` (anchor generation + SSD decode + NMS). See that file for the
MediaPipe decode parameters (strides `[8,16,16,16]`, `anchor_offset 0.5`, `fixed_anchor_size`, score
threshold 0.5).

To re-verify the checksum:

```bash
sha256sum lib/engine1/models/blazeface.onnx
# 587fa34c93de9a523e691669d2405671d67faad86e595e9a63c6d3db401f18f4
```
