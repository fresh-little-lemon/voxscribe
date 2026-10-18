# Real-timing frontend harness

The harness imports the unchanged production planner, splicer, display mapper,
highlight-motion class, revision history, and (in the companion DOM tests) App.
It never creates, adjusts, interpolates, or clamps model timestamps.

## Input

Use a JSON manifest with this structure. Paths are relative to that manifest.

```json
{
  "duration": 5.855,
  "mediaIdentity": "sha256:actual-recording-sha256",
  "audioPath": "path/to/actual.wav",
  "baseline": "reference_full.json",
  "cases": [
    {
      "name": "restore_middle",
      "kind": "omission_restoration",
      "base": "initial_omitted_middle.json",
      "text": "Complete transcript supplied to the actual model",
      "backendResult": "local_restore_middle.json"
    }
  ]
}
```

The example describes the schema, not an alignment result. `duration` must be the
actual decoded media duration. `base` (or alias `baseline`) overrides the baseline
per case. `baseSegmentId` and top-level `baselineSegmentId` select a segment when
an API response contains several. Inputs may be paths or inline JSON objects.

Supported result shapes are production API `{segments:[...]}`, a Segment, or an
actual aligner record `{transcript, words, audio_window}`. The raw aligner adapter
adds only request ID metadata. All returned word objects/timestamps are unchanged.

Supported case kinds: `omission_restoration`, `deletion`, `unspoken_insertion`,
`multi_sentence`, `replacement`. Optional `expectedPlan` and `expectedOutcome`
make explicit expectations fail visibly. An accepted negative control is reported
as a limitation; it is never converted into a successful semantic-rejection claim.

Omit `backendResult` initially to emit exact production `jobs`. Submit those jobs
to the actual backend, capture its unmodified JSON, then add the result path and
rerun. Whole-segment model output is not interchangeable with a local-job result.
The output's `{cases:[{name,jobs}]}` is directly usable by `run_real_api.py --jobs`.

## Run

From the repository root:

```sh
frontend/node_modules/.bin/esbuild experiments/public_alignment_20261018/frontend_harness.ts --bundle --platform=node --format=cjs --outfile=experiments/public_alignment_20261018/frontend_harness.cjs
node experiments/public_alignment_20261018/frontend_harness.cjs experiments/public_alignment_20261018/manifest.json experiments/public_alignment_20261018/frontend-report.json
VOXSCRIBE_HARNESS_MANIFEST="$PWD/experiments/public_alignment_20261018/manifest.json" frontend/node_modules/.bin/vitest run --config experiments/public_alignment_20261018/frontend_harness.vitest.config.ts
```

## Evidence boundaries

- Standalone checks exercise production planning, real-result splicing, exact
  untouched word object identities, zero-job deletion, stale-result guards,
  raw-text preservation, pending mapping, and immutable revision round trips
- DOM tests exercise actual App toolbar undo/redo arrays, playback active-word
  selection and gaps, pending words, and delayed responses after text, anchor,
  undo, or media changes. They replay captured real JSON through an explicitly
  controlled transport; this is not live browser-to-API/network testing
- Missing eligible local captures cause dependent DOM tests to be skipped;
  skipped checks must not be reported as passed
- Highlight motion uses real word durations with explicitly synthetic rectangles
  to test monotonic easing. It does not prove browser pixel layout or appearance
- No audio listening, acoustic boundary accuracy, general unspoken-word rejection,
  deployed-service reachability, or long-recording quality is claimed
- Cross-sentence modifications are intentionally blocked. Tail restorations may
  have only 150 ms after the last existing timed word despite a longer segment
  audio range; exact observed plans/results must be inspected before claiming
  omitted-sentence restoration works

No production files, commits, or remote repositories are modified by these tests.
