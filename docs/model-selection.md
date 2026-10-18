# VoxScribe model selection

Research checked against official sources on 2026-10-18. No additional model was downloaded or executed for this research. Performance conclusions require the project's real-audio tests.

## Recommendation

Use **Fun-ASR-Nano-2512 as an ASR candidate**, **Qwen3-ForcedAligner-0.6B for supplied-text alignment and post-edit realignment**, and **FSMN-VAD + CAM++ through the FunASR pipeline** for speech windows and anonymous speaker attribution. Finish the existing Qwen alignment smoke test before loading another large model. Keep ASR and alignment interfaces independent so recognition accuracy can be compared without replacing the editor's timing engine.

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
