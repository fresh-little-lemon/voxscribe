# Official speaker-segmentation smoke test

Measured 2026-10-18. Private real course audio was decoded with ffmpeg to 16 kHz mono PCM. No audio, transcript, or raw speaker timestamps are included here. This is a runtime/output sanity test, **not an accuracy benchmark**.

## NVIDIA Nemotron-3-Diarization (formal release)

Source: https://huggingface.co/nvidia/Nemotron-3-Diarization

The official card identifies a September 23, 2026 general-access release, OpenMDW-1.1 license, 100M parameters, and support for up to eight speakers. The native Transformers implementation was used without remote code or credentials. Download was public/ungated; no license-acceptance form was encountered. See the official license before redistribution/deployment.

Pinned revision: `f667ed73aee57d40cc39428eb768b4fd87a0a29e`.

CPU float32, 2 PyTorch intra-op and inter-op threads, Transformers 5.20.1, PyTorch 2.14.1+cpu. The existing runtime was reused read-only; caches and outputs were isolated. No GPU was used.

| Input | Audio duration | Inference only | Real-time factor | Predicted segments | Active output channels |
| --- | ---: | ---: | ---: | ---: | ---: |
| A | 65 s | 2.889 s | 0.0444 | 30 | 3 |
| B | 65 s | 2.782 s | 0.0428 | 14 | 1 |
| Continuous A-through-B | 260 s | 12.149 s | 0.0467 | 43 | 3 |

Cold load including download: 17.50 s. Warm load for continuous test: 4.66 s. Peak process RSS: 1019–1076 MiB (the historical JSON key is `peak_process_rss_mb`, calculated as Linux ru_maxrss in KiB divided by 1024). Timing excludes audio extraction, imports, download/loading and postprocessing; includes the native model's internally chunked offline forward. It is a single shared-host run, not a stable production capacity claim.

The continuous test preserves model state across internal chunks, rather than restarting at each external VAD cut. The later isolated clip uses channel 0; the same later interval in the continuous run predominantly uses channel 2. This illustrates why independently reset speaker IDs cannot be joined by numeric label. It does **not** establish that the returning person was correctly identified.

Some predicted spans are only 50–60 ms and several overlap. Output therefore needs inspection before presentation as clean turns. No human reference, listening-based speaker verification, DER, VAD recall, boundary error or identity-stability accuracy was measured. Channel counts are model predictions, not ground-truth person counts. No “SOTA” claim is made.

## Reproduce

Use Python 3.12 with `transformers==5.20.1`, `torch==2.14.1`, and soundfile; CPU wheels are sufficient. Prepare 16 kHz mono WAV inputs, then run:

```sh
OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 HF_HUB_DISABLE_IMPLICIT_TOKEN=1 \
python run_nemotron.py private-a.wav private-b.wav \
  --output-dir /private/results --cache-dir /private/hf
```

`run_nemotron.py` writes private raw timestamps and logits to the explicitly supplied output directory. Only aggregate metrics should be copied to a public repository. Keep the raw data outside the project. A continuous input is recommended when assessing identity continuity; this script starts a fresh session per file.

## Product implication

This official checkpoint is CPU-feasible on the measured host and merits an opt-in diarization backend. Keep it separate from VAD, ASR and forced alignment. Use continuous/stateful diarization, then map each aligned word to speaker activity by temporal overlap. Retain overlap/uncertainty instead of forcing one clean speaker per utterance. Before default enablement, manually annotate a small consented lecture set and evaluate missed speech, false alarms, speaker confusion and boundary errors, especially quiet/distant students and language switching.

## Alibaba/FunASR FSMN-VAD baseline

Official toolkit checkpoint: https://huggingface.co/funasr/fsmn-vad (Apache-2.0 card). Toolkit: https://github.com/modelscope/FunASR

Pinned revision: `df20e6b30c653645fa4ff125cacfcabd1020a669`. FunASR 1.4.16, kaldi-native-fbank 1.22.3, CPU 2 threads. An isolated venv was used; the existing ASR environment was not modified. The first attempt stopped because neither torchaudio nor the supported Kaldi fbank fallback was installed. Installing the small `kaldi-native-fbank` wheel in the isolated venv resolved it. No remote code was trusted, and the public model was downloaded without credentials.

| Input | Inference/feature extraction | RTF | VAD regions | Speech coverage |
| --- | ---: | ---: | ---: | ---: |
| A, 65 s | 0.268 s | 0.00413 | 3 | 50.22 s |
| B, 65 s | 0.271 s | 0.00417 | 5 | 35.25 s |
| Continuous, 260 s | 1.064 s | 0.00409 | 16 | 90.08 s |

Peak process RSS was 668–729 MiB. The successful run reused an already downloaded model (3.05 s model/cache setup); this is not a cold-network loading benchmark. Script: `run_fsmn.py`; additionally install `funasr==1.4.16` and `kaldi-native-fbank==1.22.3`. Set `HF_HOME` to a private cache directory. Supply private WAV paths and `--output-dir /private/fsmn-results`. This produces speech regions, not speaker identity or word alignment.

At a 10 ms comparison grid, FSMN covered every frame covered by the NVIDIA speaker-union mask, plus 12.15 s in A and 12.99 s in B. NVIDIA union coverage was 38.07 s / 22.26 s; its summed channel durations can be larger because channels overlap. The difference includes different default boundary padding and smoothing; it is **not** measured missed speech or proof that one model is more accurate. See `coverage-disagreement.json` and `compare_masks.py`.

For integration, preserve VAD-covered but unassigned audio as unknown-speaker speech pending ASR/manual verification. Do not use a missing diarization label to discard speech. Add human boundary/turn annotation before claiming gains on quiet questions, returning lecturers, overlap or code-switching. Both models are candidates with measured CPU feasibility; no production backend was changed by these experiments.

### Private visual review

`plot_timeline.py` creates a 260-second overview and first/last-65-second detail panels from the continuous-session JSON. It labels anonymous predicted speaker tracks and the FSMN speech track, with explicit no-reference/no-listening-review caveats. Supply `--nemotron`, `--fsmn`, and `--output` paths. The rendered PNG contains recording-derived timing information and must remain private; only the plotting code is intended for the public repository. Matplotlib is required.
