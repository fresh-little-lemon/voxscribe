# Markdown import and unanchored paragraphs

Importing a transcript is not equivalent to knowing when its words were spoken. The frontend parser removes document headings/metadata and keeps source-language paragraphs separate from optional translation annotations. Undated paragraphs must stay unaligned; do not distribute them evenly across the recording.

## Minimal coarse localization API

POST `/api/localize` accepts JSON:

```json
{"revision":"import-2","language":"English","paragraphs":[{"id":"p1","text":"The corrected original speech.","annotation":"Optional translation, never matched or aligned."}],"coarseSegments":[{"text":"The original speech recognized by ASR.","start":30,"end":50}]}
```

`coarseSegments` must be timestamped ASR text for the **same uploaded audio timeline**, sorted by start. Word-level segments give narrower candidates; 25-second ASR chunks can only provide coarse chunk boundaries. There is no claim of word interpolation. This endpoint does not upload, transcribe, or listen to audio.

Response echoes `revision` and returns `status` plus `segments`. Without coarse ASR it returns `needs_transcription`, no timestamps. Matching candidates contain `start`, `end`, heuristic `score` and `textCoverage`. These scores are string-similarity diagnostics, not acoustic confidence or probabilities. Multiple near-equal occurrences, weak/unmatched text, very short text, and >120-second candidates remain `needs_review` with candidate choices and no accepted start/end. Strong single matches have `localizationStatus:candidate` and suggested anchors; they are still unverified. Paragraphs over 400 matching tokens must be split. Broad repeated text may exceed the bounded candidate search, so review remains necessary.

English token normalization and Chinese character tokenization are unit-tested. Translation `annotation` is carried through untouched, never used as matching evidence. `language` is informational here; the acoustic aligner's language setting must match the selected original speech.

## Flow and limitations

1. Import Markdown and preview selected original-language paragraphs and annotations
2. Obtain/import timestamped coarse ASR for the same recording
3. Request candidate localization and review/edit ranges, especially repetitions
4. Submit confirmed <=120-second ranges to `/api/align` with the original-language text
5. Keep word timings unverified until listening review; editing text/audio/anchors invalidates older timings and pending responses

The MVP has no automatic full-recording ASR job queue, background whole-course localization, or automatic candidate approval. `/api/localize` does not call `/api/align` itself. Users lacking coarse ASR can supply manual ranges. The private smoke test uses only a 75-second excerpt; it is not evidence of long-recording production readiness.

## Optional automatic short-range ASR

With `VOXSCRIBE_ENABLE_ASR=1`, POST `/api/transcribe` multipart `file` plus `options` JSON `{"start":0,"end":75,"language":"English"}`. English and Chinese are supported by this bounded MVP. The selected range must be <=120 seconds, even when the uploaded original recording is longer. The official Qwen3-ASR-0.6B-hf weights may download on first use. `VOXSCRIBE_ASR_CACHE` can point at an existing Hugging Face hub cache; this never changes model packages or credentials. Models run locally, sequentially, with two CPU threads. Expect a meaningful wait on CPU; there is no persistent background job or reconnect/resume.

The response includes `coarseSegments` (machine-generated word anchors), `rawCoarseSegments` (25-second ASR chunks), method/revision, timing and warnings. It first recognizes the range, then aligns each full coarse window before localization. This context stage matters: an experiment passing only a corrected final sentence against a wide 25-second window falsely pulled its first word about ten seconds early. Refining the full recognized window first localized the same sentence to approximately the expected region. Preserve the failure as a reason to review, not a claim that the refined result is always accurate.

The frontend can therefore offer: upload Markdown + audio → choose short range → automatic local ASR/word anchors → candidate preview → confirm ranges → align corrected original text. Users do not have to create coarse JSON for this short-range flow. The endpoint is disabled by default and gives a clear 503 setup message; long-recording asynchronous processing remains unimplemented.
