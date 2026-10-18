# Real edited-transcript alignment experiment

Completed 2026-10-18 using official Qwen3-ForcedAligner-0.6B-hf, pinned revision recorded in results-metadata.json. Tested a private 75-second English lecture recording by an Italian-accented speaker; no recording or transcript is published here.

Three sequential runs on the same audio: (1) source transcript missing a passage; (2) reviewed text restoring 24 words supported by an independent ASR pass; (3) deliberately unspoken 10-word sentence inserted before the restoration. First two transcripts differed only by the restored passage, isolating alignment behavior from unrelated editorial changes.

Measured model preparation + forward pass + decoding: 8.907 / 10.344 / 10.662 seconds. Model loading separately took 12.812 seconds, including warm cache initialization. CPU only, 2 threads, BF16, torch 2.14.1+cpu, Transformers 5.20.1. These are single-run smoke-test timings, not benchmarks or accuracy measurements.

The restoration produced word timestamps for all 24 added words. Across all three runs, starts were monotonic and boundaries inside the clip. This was insufficient to establish truth: the unspoken negative sentence also received timestamps, with six of ten words collapsed to zero duration. Total near-zero durations increased from 3 in restored text to 14 in the negative case. Even the restored case had three zero-duration words, so this heuristic is not a reliable detector by itself.

No manually labeled reference word boundaries were available. Accuracy, accent robustness, speaker diarization, and generalization to other recordings have **not** been established. Independent ASR agreement supports the restored passage but is not human listening ground truth. A human must listen before approving edited passages. The service keeps `verified:false` regardless of monotonicity.

## Reproduce privately

Create an untracked JSON file with `start`, `end`, and `cases` (mapping names to full transcript strings). Then run:

```sh
python experiments/run_alignment.py /private/audio.m4a /private/output /private/cases.json
```

The output contains private transcripts and word-level results; do not commit it or upload it without authorization. Only aggregate metadata is checked in.

Official implementation/model: https://github.com/QwenLM/Qwen3-ASR and https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B-hf . Model release was January 2026; native Transformers support was added June 2026. Do not describe the -hf integration as a newly trained model.

A real multipart request through FastAPI TestClient also returned HTTP 200 and 124 model-generated word timings in 19.350 seconds including model loading. The revision string was preserved. This verifies the application contract in-process, not public network deployment. A private waveform spot-check found plausible energy onsets for the restored passage, without establishing individual word accuracy.
