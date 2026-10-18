# Continuous word-highlight motion

## Design reference

Motion's [shared layout animations](https://motion.dev/docs/react-layout-animations) connect changing selected elements with a common `layoutId`; its documentation notes inline-element transform limitations and potential child distortion during scale-based layout animation. [useSpring](https://motion.dev/docs/react-use-spring) provides a spring following a changing target, and [useReducedMotion](https://motion.dev/docs/react-use-reduced-motion) supports adapting movement to accessibility preferences.

VoxScribe uses a small equivalent specialized to transcript words, rather than adding a general animation dependency. It moves one background pill inside each active paragraph and does not scale text or change word geometry.

## Behavior

- Same-line neighboring words: translate left or right and change width with a lightly underdamped spring (stiffness 1000, damping 44, unit mass)
- New target while moving: replace the target immediately while retaining current position and velocity; there is no animation queue
- Adjacent words on different lines: reposition to the new line, with a brief 75ms reveal; never sweep diagonally across intervening text
- Explicit seeking, distant word jumps, resize, or reduced-motion preference: position immediately at the current word
- Background-tab delays: bounded integration steps prevent a large elapsed interval from destabilizing the spring
- Text: original text stays stationary and selectable. A non-interactive, accessibility-hidden identical text layer reveals white ink only inside the moving blue pill; the next word never becomes white before the background arrives
- Input: editing replaces the display with the existing uncontrolled inline editor, preserving its IME/caret protections

Only the visual rectangle is animated. Media time, word boundaries, click targets, and exported timestamps are unchanged. Keyboard focus indicators remain available.

## Verification

Tests cover left/right transfer, width changes, bounded overshoot, convergence, interrupting an active spring, cross-line/seek behavior, reduced motion, one persistent pill, accessible word count, and exact click timestamps. Existing transcript editing, Markdown, and local Library tests remain in the suite. These are numerical and DOM tests; final perceptual animation review should be performed in the deployed browser preview.
