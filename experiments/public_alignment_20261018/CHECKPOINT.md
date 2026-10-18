# Public real-alignment validation checkpoint

Status at 2026-10-18 16:47 UTC: the first five real local API calls completed.
Work is paused for the user's higher-priority CV task. No model process or package
installation remains running. Production frontend/backend/model source is unchanged.

## Completed real-model evidence

Public human speech: 5.855 s, 16 kHz mono, 187404 bytes.
Audio SHA-256: 799f78ed4beb4de7ceae3a809262d4ce242394342ccd1d58cef7d49dbc2def46.
Official Qwen/Qwen3-ForcedAligner-0.6B-hf revision:
c07281df297b9905d24a508279258cccf987a064. File hashes are in model-file-manifest.json.

All five requests went through the unchanged production /api/align endpoint in
FastAPI TestClient with real CPU model inference and HF offline mode. They are
in-process API tests, not a browser-to-server or deployed-service test.

| Case | Words | Model inference | API elapsed | Zero-duration words |
| --- | ---: | ---: | ---: | ---: |
| Full known transcript | 17 | 0.968 s | 1.065 s | 1 |
| Omit MIDDLE | 16 | 0.751 s | 0.824 s | 1 |
| Omit seven-word spoken clause | 10 | 0.653 s | 0.725 s | 1 |
| Omit eight-word spoken tail | 9 | 0.659 s | 0.740 s | 1 |
| Insert six unspoken words | 23 | 0.877 s | 0.949 s | 10 |

Model loading was 1.134 s; total preparation including first imports was 5.360 s.
The model was preloaded, so API elapsed values exclude cold initialization and
downloads. These are single-run smoke timings, not benchmarks.

All starts/ends were monotonic, nonoverlapping and inside the audio. Every result
was marked review and verified:false. The negative case still received timings
for its unspoken words. Numerical validity therefore does not prove speech truth.
Even the correct transcript had a zero-duration THE; the warnings are heuristic,
not a calibrated mismatch detector. No manual reference word boundaries exist.

The public transcript also matched an independent offline Whisper content check;
that check did not request word timestamps and is not the timing source.
Raw public API responses, the run log and exact measurements are preserved.

## Contract evidence, separately labeled

All 26 existing backend contract tests passed using the existing test environment.
They use explicit doubles and do not establish model quality. The frontend
harness compiles; 42 existing targeted frontend function tests passed, but the new
real-result replay harness has not yet been executed. No browser QA is claimed.

## Paused / not established

- Production local-window splice checks and restored-omission timing outcomes
- Real reproduction and possible fix of the missing-tail window bug
- The source-only concern is that the planner ends a tail-insertion window at the
  last timed word +150 ms, omitting the remainder even when segment.end is known
- New real-data deletion preservation, playback eligibility and undo/redo checks
- Real-result frontend/UI replay, complete-sentence insertion behavior

Do not describe the source-only tail issue as a model failure or a completed fix.
Resume by generating frontend-before-report.json from manifest.json, preserving
its exact jobs, then running the real local requests before any minimal fix.

## Reproduce

Use Python 3.12 and FFmpeg. Install CPU torch from its official wheel index first,
then backend/requirements.txt, preserving the CPU package (full version snapshot
is in python-packages.txt). download_public_assets.py downloads only the public
example audio and official fixed model revision. Set HF_HOME to that model cache;
run run_real_api.py AUDIO OUTPUT_DIRECTORY. It forces HF offline mode for inference.
See FRONTEND_HARNESS.md for the separate production-function/UI replay harness.
The experiment started from repository HEAD cac18474c79bc7909418162ddbca196e8ffcefaf.

## Source and license

The exact audio URL appears in download_public_assets.py and is used in the
[official Qwen model card](https://huggingface.co/Qwen/Qwen3-ForcedAligner-0.6B-hf).
It is public LibriSpeech example 1272-128104-0000, with transcript corroborated by
the [HF demo dataset](https://huggingface.co/datasets/hf-internal-testing/librispeech_asr_demo/viewer).
The [original LibriSpeech corpus](https://www.openslr.org/12) is CC BY 4.0 and
credits Vassil Panayotov, Guoguo Chen, Daniel Povey and Sanjeev Khudanpur; derived
from LibriVox audiobooks. Audio/model binaries are not included in Git.

No private course audio or transcript was used. No remote inference, deployment,
paid API, model source modification, repository deletion or Git push occurred.
