# VoxScribe frontend

React + TypeScript + Vite. Run `npm ci`, then `npm run dev` and open http://127.0.0.1:5173. Start the backend on port 8000; Vite proxies `/api` to it. `npm test` runs behavioral tests; `npm run build` typechecks and creates `dist`.

- Audio layout: summary/speaker/chapters sidebar, independently scrolling transcript, fixed player
- Video layout: large left video and player, speaker/info/clips below, transcript on the right
- The same video element drives both audio and video playback and all seek/highlight state
- Upload media, paste corresponding text, save, set a segment's start/end in seconds, and align (120 seconds maximum per segment)
- English and Chinese alignment; optional real short-window ASR for Markdown localization; no automatic summary generation
- Edits invalidate old timing; in-flight results are rejected if the editor revision changed
- Zero/near-zero word durations are not clickable; all model output requires listening review
- Transcript overflow menu imports/exports JSON including word timestamps; imported timestamps must match the selected media
- The built-in sample text and synthetic time axis are visibly labeled demonstration; they are not alignment results
- Local files remain in browser memory until the user requests alignment; then they are sent to the configured backend

No private audio, video, meeting text, or real alignment outputs are included in this frontend. The optional `window.VOXSCRIBE_PRIVATE_DEMO` bootstrap is only for locally generated, privately delivered offline review packages; no media is bundled in the public build.

## Known limits

Single speaker labels are editable only through imported JSON. Segment creation is through JSON import; a fresh media import provides one editable segment. No persistent project storage, whole-recording transcription queue, speaker diarization, cloud sharing, or AI summaries. The backend must be reachable for new alignment; offline HTML can play imported or embedded local media and review existing timing but cannot align by itself.

## Markdown / text import

Use **导入文稿** to upload `.md`, `.markdown`, or `.txt` (up to 2 MB). A preview shows natural paragraphs in order, headings, list text, speaker labels, and explicit `[00:09:50｜原标说话人 1]` / `[00:14:05]` anchors. Headings and unselected-language translation are annotations, not alignment input. Common formatting/revision wrappers are removed conservatively; unmatched markers remain visible with warnings. HTML is rendered strictly as text.

Choose all, English, or Chinese. Language separation is a line-based heuristic, so inspect mixed sentences and proper nouns. Detected bilingual text imported as **all** is deliberately blocked from alignment; reimport with the spoken language selected. Original source content, name, import mode, and version are retained in exported JSON's `importVersions`. Browser refresh loses unsaved work; export before closing.

Untimed paragraphs have `start:null`, `end:null`, no words, and `needs_localization`. Explicit markers only supply starts, never fabricated ends or words. The frontend never distributes time by text length. Uploading audio after Markdown keeps the imported text and clears old word timing.

The transcript overflow menu provides **导入粗转写 JSON 并定位**. Supply an array or `{segments:[{text,start,end}]}` from an existing coarse transcription. `/api/localize` returns candidates for preview; choosing to use candidates fills only suggested ranges, still marked for listening review. Ambiguous/unmatched paragraphs remain unlocalized. There is no automatic whole-recording transcription queue. After reviewing every range, run the separate forced-alignment step; current backend limits still apply (12 segments, 120 seconds each). All in-flight localization results are revision-checked, including before candidate acceptance.

### Default short-media workflow (no manual coarse JSON required)

1. Import your media, then import your Markdown and select the spoken language
2. Click **自动定位**, review/select a media range up to 120 seconds, and start
3. The frontend calls real `/api/transcribe`, then `/api/localize`; inspect candidate ranges and explicitly accept them
4. Review/edit anchors, then click **重新对齐** for word timestamps

Automatic ASR requires backend `VOXSCRIBE_ENABLE_ASR=1` and its model/dependencies. Disabled/missing services are shown as errors, with original text preserved. The advanced coarse-JSON import remains optional. Long recordings must use selected windows; a whole-course asynchronous queue is not implemented. Unit tests use explicitly labeled API doubles for orchestration; real model results are measured separately by the backend.

## Local library and folders

The default entry screen is a local Library, with a folder tree and searchable/sortable recording, video, and document list. Create, rename, and move folders; rename/move records; open details and return. Moving a record to the recycle bin requires confirmation and is fully recoverable. There is no permanent-delete action or background garbage collection of user media.

Folder metadata, transcript snapshots, and original Markdown versions are stored in localStorage (`voxscribe-library-v1`). Audio/video Files are stored in IndexedDB (`voxscribe-media-v1`). Changes made in detail are saved back to the selected record. These are browser-local stores, not cloud storage or cross-device sync. Clearing browser site data removes local contents; export important transcripts and retain source media. Storage failures are disclosed rather than pretending media was saved.

The private review package initially opens the Library, with a one-click real 75-second audio sample. Back returns to the Library, where that private record remains available locally. The public app contains only a neutral, clearly labeled demo. A static hosted preview can replay existing real timestamps but cannot run Python ASR/alignment; recomputation requires the configured local backend.

## Playback and inline editing polish

Current-word highlighting uses one interruptible, deadline-bounded background pill with fixed text geometry; no border/box-shadow animation. Neighboring words slide left/right with a short, monotone width change that lands firmly within 90ms (or 45% of a short word), while line breaks reveal in place and seeks/reduced-motion snap. See ../docs/highlight-motion.md for references and behavior. Playback reads the same media element on animation frames, preserving keyboard-only focus outlines. Skip controls use centered SVG numerals. Language and playback-rate popovers expose keyboard navigation, selection state, outside-click and Escape dismissal.

Transcript editing stays in the paragraph itself. The top toolbar provides undo/redo, cancel, done, and an optional time-range popover. The contentEditable DOM is unmanaged during typing, so playback updates do not overwrite its content or selection. Composition input is committed only after IME completion; paste is plain text. Draft edits invalidate pending result revisions, while completing edits marks changed timing stale. Cancel restores the paragraph's pre-edit state. Behavioral coverage includes IME, playback rerender, undo/redo/cancel, repeated editing, menu dismissal, and skip-icon geometry.

## 句级增量编辑与版本记录

- 已有可信结构的逐词时间轴上，只改标点、大小写或无歧义整词删除，会直接保留原词时间，不调用模型。这里的“保留”不表示语音内容已核验。
- 插入/替换只请求修改句子内的邻近小窗口（最多前后一个词及 150 ms 音频上下文），提交 `scoped: true`；模型返回值不平移、不插值、不夹紧。窗口外词对象及时间原样保留。
- 跨句修改、歧义或无法安全复用的旧时间轴会提示检查，绝不静默扩大为整段重算。请逐句保存。新稿首次对齐仍需要真实锚点或先粗定位。
- 局部计划和原已对齐基线随文稿保存；连续修改会对照基线重新计算。接收新的粗定位范围会清除对应旧计划。
- 工具栏撤销/重做支持已经保存的文稿修改，文字、时间轴、注释、导入版本与局部计划一起恢复。编辑中可用 Ctrl/Cmd+Z、重做；保存不清除本次详情会话的撤销记录。重新打开文件可通过“更多 → 编辑历史”回滚持久化版本。
- 编辑历史保存在此浏览器，支持内容/时间轴差异预览、回滚产生新版本。不同媒体的版本不能回滚。清除旧版本须明确确认，保留当前文稿和媒体；确认删除同时清空本次会话撤销/重做记录。
- 编辑、时间范围调整、媒体替换、撤销/重做和历史回滚都会废弃尚未返回的旧对齐请求。静态预览没有运行模型；重新计算需启动本地后端。

### 局部待对齐的显示

局部修改后，仅修改文字没有时间映射；其余词仍按原时间点击跳转和跟读高亮。高亮严格在该词真实 `end` 停止，不延长到下一幸存词，不跨越删除或待对齐的录音空隙。原文标点与未计时文字完整保留。
旧版保存的 stale 状态不会被清空。再次编辑保存时，仅当同一媒体历史中存在完全相同词时间数组的已对齐基线，才恢复增量判断；不能验证的情况显示具体原因，并保留现稿与历史供检查。

### 安全重开原始演示

私有演示页使用 `?fresh-demo=20261018b` 可自动创建并进入一份干净原始演示副本。相同 nonce 再次打开/刷新不会无限复制，也不会覆盖该副本后续的编辑。需要再重开时使用页面的“重新打开原始演示”按钮，它会新建另一份副本。原有文件、修改记录和编辑历史全部保留，可返回资源库继续访问。普通无内嵌音频的公开版本不会伪造真实示例。
