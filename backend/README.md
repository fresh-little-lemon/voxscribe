# Local forced-alignment service

Real Qwen3-ForcedAligner inference against uploaded audio and **edited text**. This is not an ASR substitute. There are no fake timings or silent mock fallbacks.

## Run

Python 3.12 and FFmpeg must be installed. Create an isolated virtual environment, then:

```sh
pip install -r backend/requirements.txt
# Optional writable model cache; download is about 1.8 GB.
export HF_HOME="$PWD/.model-cache"
uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

CPU defaults to bfloat16, SDPA, at most two torch threads. First request downloads official pinned weights. Sequential model execution prevents overlapping inferences. Use one server worker. A modern CPU with BF16 support is recommended; CPU compatibility/performance varies. Model failures return HTTP 503 rather than fabricated output. This local MVP is not an authenticated Internet deployment.

## API

POST `/api/align`, multipart `file` (audio/video file) and `transcript` (JSON string):

```json
{"revision":"edit-2","language":"English","segments":[{"id":"s1","speaker":"Speaker 1","text":"The edited spoken text.","start":44,"end":119}]}
```

Upload the original recording when start/end refer to its timeline. If uploading an excerpt, start/end must refer to that excerpt, not the original. Maximum 512 MiB file, 513 MiB complete multipart body enforced before parsing, 12 segments per request, 120 seconds per segment. The local request guard rejects non-loopback Host headers and browser Origins other than localhost:5173 / 127.0.0.1:5173. Segment anchors receive 0.5 seconds context. The server decodes only those windows with FFmpeg. Language defaults English; supported model languages include Chinese. Longer documents should submit edited segments in small batches.

Response includes `revision`, `method`, `modelRevision`, `warnings`, and `segments`. Each segment includes `words:[{text,start,end}]`, `textHash`, `inferenceSeconds`, `verified:false`, `alignmentStatus`, and `warnings`. All times are seconds in the **uploaded file's timeline**. Clip offset is added exactly once by the server.

On any edit, the client must invalidate old word timestamps and mark the segment unaligned. Only apply a response whose revision equals the still-current editor revision. A content hash is supplied for further checking. The server does not store an authoritative document revision and cannot independently detect a changed client draft.

`aligned` means the model emitted timings; `review` means additional heuristic warnings were found. **Neither means verified speech.** Always display “Aligned · needs listening review”. The model can force unspoken words onto real speech. Near-zero-duration and invalid-boundary heuristics are not calibrated mismatch detection. Do not auto-accept transcript corrections based on timestamps. Preserve machine output, warnings, and manual review status separately.

Uploaded files are temporary and deleted after processing or failure. Audio is never sent to Hugging Face or any speech API; only model assets download from Hugging Face. Health: GET `/api/health` (does not load model).

## Tests and experiment

`python -m pytest backend/tests -q` tests contract validation and error handling (contract tests use explicitly labeled doubles). Real-model measurements are in `experiments/results-metadata.json` and `experiments/README.md`. Private audio/text are excluded.

### Incremental sentence-local edits

The frontend reuses exact existing word timestamps for unambiguous complete-word
removals and punctuation-only edits, without calling the model. Removed audio is
left as a timing gap. Insertions, replacements, and within-word edits submit only
the changed region plus at most one unchanged neighboring word on each side,
within the same sentence, with 150 ms of audio padding. Such `/api/align` segments
set `scoped: true`; the backend must not add its usual 500 ms padding again.
Model results are spliced only into the edited region and rejected if they cross
unchanged timing anchors, mismatch the requested text, or belong to an obsolete
audio/text revision. No timings are interpolated or clamped.

Current limitations: save changes one sentence at a time. A change spanning
multiple sentences is blocked rather than expanded to an entire paragraph.
Deleting repeated words or phrases with more than one possible surviving word
mapping is also blocked for review rather than silently choosing an occurrence.
These cases do not fall back to full-paragraph realignment.

A private, cached-model CPU smoke test exercised the actual scoped endpoint on an
8.22-second sentence window: HTTP 200, 20 word timings, all within the exact
requested bounds, and no additional backend window expansion. End-to-end elapsed
time was 9.69 seconds (including 2.24 seconds model loading), using two CPU
threads with network model downloads disabled. A separate edit on an existing
124-word result removed two unambiguous complete words with zero alignment jobs;
all 122 surviving timestamp pairs and word objects remained exactly identical.
Public numerical results are in `experiments/incremental-metrics.json`; audio,
transcript text, request bodies, and full responses remain private. These checks
establish scoping and timestamp preservation, not transcript correctness.
