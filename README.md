# VoxScribe

Editable audio and video transcription with synchronized word highlighting.

VoxScribe combines a media player, speaker-aware transcript and correction workflow. Its central editing feature is local speech–text realignment: after correcting words or restoring an omitted sentence, the affected transcript receives new timestamps against the original media.

## First milestone

- Audio workspace: summary and speaker sidebar, transcript pane, fixed playback controls
- Video workspace: large video pane with speaker information, adjacent transcript and summary tabs
- Media import, seek by word, playback-rate control and current-word highlighting
- Editable segments with explicit pending, aligned and review-required states
- Real local forced alignment using the official Qwen3-ForcedAligner model
- Version-aware updates so an old alignment result cannot overwrite a newer edit
- Markdown import with language-aware bilingual handling and untimed paragraph localization
- Browser-local folder management and media/document library

The first UI and local alignment service are implemented. The frontend builds successfully; backend tests and a real 75-second recording experiment pass the documented checks. Browser visual QA and end-to-end browser/API operation remain to be verified. See `frontend/README.md`, `backend/README.md`, and `experiments/README.md` for exact supported behavior and measurements. An opt-in short-range ASR/localization path supports untimed Markdown for selected ranges up to 120 seconds. Full-recording asynchronous transcription and integrated speaker diarization remain subsequent work. The workspace now includes browser-local folders, media persistence and recoverable trash; it is not cloud-synchronized storage.

## Repository layout

- `frontend/`: browser application
- `backend/`: media decoding and alignment API
- `experiments/`: reproducible alignment evaluation scripts and non-sensitive measurements
- `docs/`: product requirements and model-selection notes

Original recordings, model weights, tokens, local caches and uploaded files are excluded from the repository.

## Alignment semantics

A corrected transcript of words actually spoken can be aligned to its source audio. Notes, translations and paraphrases use separate annotations or segment associations. Current model timestamps remain unverified until reviewed. Suspicious boundaries receive warnings; unsupported text can still receive timestamps, as demonstrated by the negative test. Reliable rejection of every unspoken insertion is not yet implemented.

Audio and video use the original media timeline. Silence is preserved, segment-relative times are converted back to absolute times, and video playback is the time source in video mode.
