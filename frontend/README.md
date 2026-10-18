# VoxScribe frontend

React + TypeScript + Vite. Run `npm ci`, then `npm run dev` and open http://127.0.0.1:5173. Start the backend on port 8000; Vite proxies `/api` to it. `npm test` runs behavioral tests; `npm run build` typechecks and creates `dist`.

- Audio layout: summary/speaker/chapters sidebar, independently scrolling transcript, fixed player
- Video layout: large left video and player, speaker/info/clips below, transcript on the right
- The same video element drives both audio and video playback and all seek/highlight state
- Upload media, paste corresponding text, save, set a segment's start/end in seconds, and align (120 seconds maximum per segment)
- English and Chinese alignment; no ASR or automatic summary generation in this MVP
- Edits invalidate old timing; in-flight results are rejected if the editor revision changed
- Zero/near-zero word durations are not clickable; all model output requires listening review
- Transcript overflow menu imports/exports JSON including word timestamps; imported timestamps must match the selected media
- The built-in sample text and synthetic time axis are visibly labeled demonstration; they are not alignment results
- Local files remain in browser memory until the user requests alignment; then they are sent to the configured backend

No private audio, video, meeting text, or real alignment outputs are included in this frontend. The optional `window.VOXSCRIBE_PRIVATE_DEMO` bootstrap is only for locally generated, privately delivered offline review packages; no media is bundled in the public build.

## Known limits

Single speaker labels are editable only through imported JSON. Segment creation is through JSON import; a fresh media import provides one editable segment. No persistent project storage, automatic transcription, speaker diarization, cloud sharing, or AI summaries. The backend must be reachable for new alignment; offline HTML can play imported or embedded local media and review existing timing but cannot align by itself.
