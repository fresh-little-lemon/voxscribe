# VoxScribe model selection

Research checked against official sources on 2026-10-18. No additional model was downloaded or executed for this research. Performance conclusions require the project's real-audio tests.

## Recommendation

Use **Fun-ASR-Nano-2512 as an ASR candidate**, **Qwen3-ForcedAligner-0.6B for supplied-text alignment and post-edit realignment**, and **FSMN-VAD + CAM++ through the FunASR pipeline** as the lightweight baseline. **NVIDIA Nemotron-3-Diarization (2026-09-23)** is the priority next candidate for advanced speaker segmentation; validate it against the baseline before selecting it. Finish the existing Qwen alignment smoke test before loading another large model. Keep ASR and alignment interfaces independent so recognition accuracy can be compared without replacing the editor's timing engine.

Fun-ASR and Qwen3 are both Alibaba/Tongyi projects. Prefer these official models over community fine-tunes as the default. NVIDIA NeMo Forced Aligner is an official alternative, but requires an appropriate CTC checkpoint and is not established here as a better Chinese/English choice.

## Fun-ASR model versus FunASR toolkit

- **Fun-ASR-Nano-2512**: official base checkpoint supports Chinese, English and Japanese, Chinese dialects/regional accents, and regional English/Japanese accents; approximately 800M parameters. Do not describe the base Nano checkpoint as the separate 31-language model.
- **Fun-ASR-MLT-Nano-2512**: separate 800M multilingual checkpoint supporting 31 languages.
- **FunASR toolkit**: orchestrates different ASR, VAD, punctuation, alignment and speaker models. Its complete feature list is not a promise that one checkpoint emits all outputs.
- Official benchmarks are not proof that a particular lecture, accent or code-switching sample will work better than Qwen ASR. Compare against representative recordings.

Source: https://github.com/QwenAudio/Fun-ASR

## Three different timestamp mechanisms

### Nano native CTC timestamps

The official README explicitly distinguishes artifacts:

- Current ModelScope `FunAudioLLM/Fun-ASR-Nano-2512` includes all 86 trained `ctc_decoder.*` / `ctc.*` tensors. Documented `model.pt` SHA-256: `81fec8616083c69377f3ceef36aba3655660ee0ca69a5d4a1e9810cd340ca499`.
- Hugging Face revision `272c57b82523ada6fd87095e955f8e29100979ab` is an older text-only artifact without those tensors. Documented SHA-256: `55ae0d2fee369f0f11cce0795f6927934ad17cf11b278a7e56a51272074160bb`.
- Current repository code with `funasr>=1.3.26` should omit unavailable timestamps rather than returning untrained/random alignments. Pin the hub, revision and hashes; do not generalize the known old HF revision to every future HF checkpoint or the separate native Transformers `-hf` conversion.

The source does invoke CTC forced alignment, but its normal inference path aligns the **ASR-generated** `result['text']` and CTC decoding, not a documented caller-supplied corrected transcript. Reusing its CTC logits with new target tokens is a plausible custom implementation, not a verified ready-to-use edit API. Normal `generate()` accepting hotwords or previous text is not equivalent to corrected-transcript alignment.

Source: https://github.com/QwenAudio/Fun-ASR#capability-boundaries

Implementation: https://github.com/QwenAudio/Fun-ASR/blob/main/model.py#L713-L727

### FunASR fa-zh / MonotonicAligner

This is a **separate** timestamp prediction model and does accept supplied audio plus text. The official example calls `generate(input=(audio, text), data_type=('sound', 'text'))`; thus it would be inaccurate to say FunASR has no reference-text alignment.

However, the published model is Mandarin-oriented. Source inference calculates the supplied token count, passes that count to the acoustic timestamp predictor, and associates the resulting boundaries with the supplied tokens. This is not evidence of lexical-content-conditioned matching or verified recovery of arbitrary mismatched/inserted passages. Treat it as a Chinese baseline, not the default mixed Chinese/English editing aligner. Do not promise that equal-length substitutions will meaningfully move boundaries.

Example: https://github.com/modelscope/FunASR/blob/main/examples/industrial_data_pretraining/monotonic_aligner/demo.py

Implementation: https://github.com/modelscope/FunASR/blob/main/funasr/models/monotonic_aligner/model.py#L209-L240

Model: https://huggingface.co/funasr/fa-zh

### Qwen3 forced aligner

Official dedicated `align(audio=..., text=..., language=...)` API accepts the corrected transcript directly, with Chinese/English among 11 supported languages, word/character timestamps and up to five minutes per input. This is the clearest supported interface for VoxScribe's core feature. The model was released 2026-01-29; the 2026-06-26 native Transformers `-hf` release is an integration update, not a new model generation.

Sources: https://github.com/QwenLM/Qwen3-ASR#forcedaligner-usage and https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B-hf

## Speakers and paragraphs

Nano does not emit speaker labels itself. The official composed example uses FSMN-VAD, Nano, CAM++ and CT-Punc. CAM++ provides speaker embeddings for the pipeline's speaker attribution; it does not establish people's real identities. The README warns that sentence `start`/`end` in this example are VAD boundaries, not reliable native character timestamps. Assign aligned words to speaker intervals and retain ambiguity for overlapping voices. Paragraph segmentation should remain an editable presentation layer over the word timeline.

Sources: https://github.com/QwenAudio/Fun-ASR#speaker-diarization and https://huggingface.co/funasr/campplus

## Licenses checked

- Fun-ASR repository and `FunAudioLLM/Fun-ASR-Nano-2512` model card: Apache-2.0.
- FunASR toolkit: MIT. Its pretrained weights have separate licenses.
- Qwen3 forced aligner code/model: Apache-2.0.
- `funasr/campplus` model card: Apache-2.0.
- `funasr/fa-zh` model card: custom `model-license`, linking the FunASR Model License Agreement; do not label all FunASR checkpoints MIT or Apache. Verify the exact selected VAD/punctuation artifacts separately before distribution.

Sources: https://huggingface.co/FunAudioLLM/Fun-ASR-Nano-2512 ; https://github.com/modelscope/FunASR#license ; https://huggingface.co/funasr/campplus ; https://huggingface.co/funasr/fa-zh

## Product acceptance criteria

1. Correct and restore genuinely spoken words, then recompute only a bounded audio window with stable neighboring anchors.
2. Preserve original audio including VAD-rejected passages; let the user select a suspected missing passage.
3. Mark paraphrases or words absent from the recording as unaligned or passage-linked. No aligner output alone proves speech occurred.
4. Never fabricate timestamps when a checkpoint lacks its alignment weights. Normalize second/millisecond units explicitly.
5. Store revision IDs so stale alignment jobs cannot overwrite later edits; validate bounds/order and maintain visible review states.

Newer community projects such as FlexAligner are research references only under the current vendor preference. They are not the selected production dependency.


## Advanced audio segmentation: three deployment routes

“Audio segmentation” covers distinct outputs:

- VAD: speech/non-speech intervals for scheduling recognition; never discard original audio.
- Diarization: anonymous speaker activity intervals, possibly overlapping. This does not extract separate clean waveforms.
- Forced alignment: timestamps for supplied words, including corrected text. Keep Qwen for this task.
- Semantic paragraphs: an editable transcript presentation layer, informed by pauses, turns and meaning.

### 1. Uploaded lectures/meetings: priority quality candidate

Use optional FSMN-VAD or MarbleNet for ASR scheduling, Fun-ASR for recognition, **Nemotron-3-Diarization** on continuous audio for speaker intervals, then Qwen for words. Do not splice out silence before diarization without maintaining an exact timeline map; arbitrary independent clips can also reset speaker identity.

NVIDIA released the formal model on **2026-09-23**. It supports up to eight speakers, overlapping activity and stateful long-recording inference. Its roughly 100M parameters are much smaller than a general audio-language model. Start with the published 30.4-second-buffer offline-style setting. This is not a maximum recording length. The formal weights use **OpenMDW-1.1**; do not substitute the separately restricted `-preview` artifact.

The publisher reports same-protocol AliMeeting near-field DER **6.40% versus Sortformer v2.1 11.57%**, and far-field **10.47% versus 13.69%**, using overlap-inclusive scoring, zero collar and forced-alignment-derived reference labels. These numbers cannot be compared directly with papers using different RTTMs. They justify testing the newer model, not declaring universal SOTA or guaranteed accented-lecture accuracy. More than eight speakers remains outside its design; long noisy recordings can degrade.

Model/release/license/benchmark: https://huggingface.co/nvidia/Nemotron-3-Diarization

For the first reproducible run, prefer official NeMo on Linux with a supported NVIDIA GPU. No verified minimum VRAM figure is claimed here. Record peak VRAM, wall time and checkpoint revision rather than deriving requirements from weight file size.

Deployment guidance: https://huggingface.co/blog/nvidia/nemotron-diarization

### 2. Local desktop or live capture: same new model, smaller runtime

Use Nemotron-3-Diarization through NVIDIA's official **NeMo-Speech.cpp** runtime. It supports CPU, CUDA, Metal and Vulkan backends and is Apache-2.0 for NVIDIA-authored code; model terms remain separate. CPU availability does not establish real-time diarization speed on the user's machine. Published ASR/TTS speed figures must not be reused as diarization benchmarks.

Explicitly select the V3 checkpoint: default diarization may select the older four-speaker model. Use a stateful pass for long recordings and `v3-offline` for larger chunks. The CLI's full-attention `--offline` path is for short recordings, with an approximately 6.6-minute positional-table limit. For live mode, evaluate quality/latency tradeoffs and keep labels provisional until stable. This route is an alternative deployment of the same model, not a claim that three unrelated models are equally state of the art.

Runtime/license/backends: https://github.com/NVIDIA/NeMo-Speech.cpp

Long-recording and model-selection details: https://github.com/NVIDIA/NeMo-Speech.cpp/blob/main/docs/cli.md

### 3. Lightweight Alibaba baseline: simplest integration

Use **FSMN-VAD + CAM++** in FunASR, retaining Fun-ASR and Qwen as independent recognition/alignment components. FSMN-VAD supports Chinese/English, offline/streaming use and CPU execution. CAM++ supplies speaker embeddings; clustering and timeline attribution are additional pipeline operations. Both linked weight cards specify Apache-2.0. This is a practical CPU-capable segmentation baseline, not a verified overlap-aware replacement for the newer end-to-end diarizer. ASR/alignment hardware costs are separate.

VAD: https://huggingface.co/funasr/fsmn-vad

Speaker embedding model: https://huggingface.co/funasr/campplus

CPU tutorial: https://github.com/modelscope/FunASR/blob/main/docs/tutorial/README.md

### VAD A/B alternative and release-date discipline

**NVIDIA Frame-VAD Multilingual MarbleNet v2.0** is a credible official VAD alternative: 91.5K parameters, Chinese/English among six languages, 20ms frame speech probabilities, PyTorch CPU/GPU and documented ONNX CPU execution. Its weight license is the NVIDIA Open Model License. It predicts speech activity, not speakers or words. The original MarbleNet paper is from 2020/ICASSP 2021; that is not the v2 weight release date. An exact initial v2 weight release date was not established here, so it is not labeled a newly released 2026 model. Its ROC-AUC benchmark does not establish better boundary accuracy than FSMN-VAD.

Model/license/deployment: https://huggingface.co/nvidia/Frame_VAD_Multilingual_MarbleNet_v2.0

## Next real-audio test, after Qwen smoke-test completion

No second large model has been loaded for this research. Prepare one fixed test set with: Mandarin lecture, accented English lecture, Chinese/English code-switching, rapid speaker turns, overlapping speech, low-volume speech, noise/music, and a long recording with a returning speaker. Include a >8-speaker case as an explicit capacity stress test, not a promised supported use case.

- VAD: missed speech, false alarms, clipped word starts/ends, short interjections and quiet speech. Compare at the same threshold-selection policy.
- Diarization: DER components, speaker-count error, overlap-inclusive score and speaker consistency over time. Pin RTTM reference, collar, overlap policy, postprocessing, runtime and precision.
- Word alignment: human-checked boundary error and missing-passage restoration after edits. Test unspoken insertions separately; they must not silently become trustworthy speech timestamps.
- Deployment: cold/warm latency, memory, wall time and input-buffer latency separately. Evaluate quantized CPU and GPU outputs independently.
- Integration: words overlapping multiple speakers retain ambiguity; a timestamp midpoint heuristic alone cannot reliably assign simultaneous utterances to their true speakers.

Official evaluation protocol: https://huggingface.co/nvidia/Nemotron-3-Diarization/blob/main/diarization_evaluation.md
