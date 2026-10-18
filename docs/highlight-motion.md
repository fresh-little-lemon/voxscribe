# Continuous word highlight and original punctuation

## References and approach

Motion's [shared layout animations](https://motion.dev/docs/react-layout-animations) connect changing selected elements with a shared identity; its documentation describes inline-transform limitations and potential child scaling. [useSpring](https://motion.dev/docs/react-use-spring) follows changing targets, and [useReducedMotion](https://motion.dev/docs/react-use-reduced-motion) supports accessibility preferences.

VoxScribe implements a lightweight shared background pill without a general animation dependency. Based on user feedback, the latest motion uses a finite, monotone ease-out rather than a long-running spring. It keeps a natural transfer but lands decisively on each word.

## Transfer timing

- Maximum transfer: 90 milliseconds
- For short words: at most 45% of the word duration, with a 12ms practical minimum
- A fresh 90ms transfer reaches 90% of its distance at approximately 48ms and lands exactly at 90ms in the numerical test
- For an 80ms word, the transfer ends at 36ms, leaving the remaining word interval visually stationary
- Position and width use a monotone cubic Hermite curve; there is no overshoot
- Interrupted transfers start from the current visual position, replacing the target immediately. Forward velocity is carried where it preserves monotonicity; no queued old-word animations
- Rendering is frame-quantized: the exact endpoint is painted on the first animation frame at or after its deadline
- Same-line neighbors slide left/right; adjacent line changes reveal in place for 75ms. Explicit seeking, distant jumps, resizing, or reduced motion snap directly

Text is never scaled or translated. A non-interactive, accessibility-hidden copy with identical typography reveals white ink only inside the moving blue background. Keyboard focus indicators remain available. Editing retains the existing uncontrolled inline editor and IME protections.

## Preserve punctuation from the source

The API's `segment.text` is the original/corrected transcript, including punctuation. Model `words` may omit punctuation. Previously, rebuilding sentences from model word labels dropped commas and periods.

`mapTranscriptDisplay` now maps normalized lexical characters from model words back to exact source ranges. The visible strings come from source slices, preserving punctuation, whitespace, case, apostrophes, abbreviations, newlines, and bilingual quotation marks. Trailing punctuation may share the preceding word's visual span, but gets no independent timestamp. Original word objects and times are never mutated. This preserves source punctuation; it is not ASR-generated punctuation.

Matching is conservative and checks the complete normalized lexical sequence. If it differs, the full source remains visible with a clear warning and no false clickable word mapping. Extra translation or edited words cannot silently acquire model timing.

## Verification

Tests measure 90% arrival time, exact settle time, zero overshoot, short-word deadlines, interruption position continuity, both directions, line changes, seeking, reduced motion, persistent pill identity, and unchanged click timestamps. Text tests cover spaces, contractions, abbreviations, accents, Chinese/English quotes, literal markup, and mismatch fallback. An edit → alignment-response test verifies punctuation remains visible. The private demo runtime separately compares displayed text against the actual API source verbatim.
