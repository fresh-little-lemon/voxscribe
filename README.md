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

Implementation and real-recording validation are in progress. Test results and reproducible commands are recorded with the implementation; screenshots alone do not establish alignment accuracy.

## Repository layout

- `frontend/`: browser application
- `backend/`: media decoding and alignment API
- `experiments/`: reproducible alignment evaluation scripts and non-sensitive measurements
- `docs/`: product requirements and model-selection notes

Original recordings, model weights, tokens, local caches and uploaded files are excluded from the repository.

## Alignment semantics

A corrected transcript of words actually spoken can be aligned to its source audio. Notes, translations and paraphrases use separate annotations or segment associations. Words without reliable matches remain visibly unaligned rather than receiving fabricated timestamps.

Audio and video use the original media timeline. Silence is preserved, segment-relative times are converted back to absolute times, and video playback is the time source in video mode.
