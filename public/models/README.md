# AI Model Directory

Place the ONNX model file here before running the application.

## Required File

**Filename:** `realesr-general-x4v3.onnx`  
**Path:** `public/models/realesr-general-x4v3.onnx`

## Download Instructions

1. Visit: https://huggingface.co/jonathanst29/tinier-upscale-models
2. Download `realesr-general-x4v3.onnx` (~4.6 MB)
3. Place the file in this directory: `public/models/realesr-general-x4v3.onnx`
4. Restart the dev server (`npm run dev`)

## Model Details

- **Architecture:** SRVGGNetCompact (Real-ESRGAN)
- **Source weights:** realesr-general-x4v3.pth
- **Upscale factor:** 4× fixed
- **Input:** float32 [1, 3, H, W], RGB, [0, 1]
- **Output:** float32 [1, 3, 4H, 4W], RGB, [0, 1]
- **Format:** fp32, opset 17, dynamic H/W axes
- **License:** BSD-3-Clause (free for commercial use)
- **Parameters:** ~1.2M
