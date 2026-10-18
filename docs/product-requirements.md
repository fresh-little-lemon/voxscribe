# VoxScribe first milestone

## Goal

Turn audio or video into editable text while keeping playback synchronized after corrections. The initial visual reference is the user's Feishu Minutes screenshots, complemented by read-only inspection of an accessible recording page.

## Audio workspace

A pale header contains recording metadata and actions. A left sidebar contains summary, speakers and chapters. The main transcript scrolls independently above a fixed media-control bar. Speaker/time anchors separate paragraphs; the current spoken word is highlighted in blue. Search locates occurrences and supports seeking to their timestamps.

## Video workspace

A roughly 57/43 split places video and speaker activity on the left and transcript/summary tabs on the right. Search remains available above the transcript. The video element owns playback time; no second independent audio player is started. Layout adapts to narrow screens. A later user-provided reference link will refine this view.

## Correction workflow

1. Retain original media and original transcript revisions
2. Record text edits and mark affected segments stale
3. Use neighboring stable words and segment bounds to select an audio interval
4. Align the entire corrected interval, including context
5. Restore absolute offsets; check interval bounds, word ordering and suspicious durations
6. Apply results only to the matching transcript revision
7. Display review-required or unaligned words when matching is unreliable

Restoring a spoken omitted sentence is the primary acceptance case. Adding a sentence absent from the recording is a negative test: a model-produced timestamp is not sufficient proof of a match.

## Acceptance evidence

- UI screenshots for audio and video layouts
- A real corrected-omission case with before/after alignment output
- Measured CPU inference time and fixed model revision
- Click-to-seek and current-word highlighting against actual media playback
- Negative test for unspoken inserted text
- Explicit distinction between fixture data, live inference, and manually checked timing accuracy
