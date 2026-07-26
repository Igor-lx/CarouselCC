# config/interaction.ts — hover, visibility, autoplay pacing

- **`HOVER_PAUSE_DELAY`** — delay before a desktop hover pauses autoplay.
- **`VISIBILITY_THRESHOLD`** — fraction of the viewport that must be on screen
  before autoplay resumes.
- **`AUTOPLAY_RESETTLE_DELAY_MS`** — quiet window after the last glass/viewport
  activity (a finger anywhere, page-scroll frames incl. the fling, chrome
  resizes) before an autoplay tick may fire. After a mobile toolbar settle the
  compositor misses the presentation latch for a few vsyncs on weak GPUs, so
  motion STARTED in that window visibly bounces; the page can only avoid
  starting motion inside it. The window self-extends on every signal, so this
  covers only the silent tail after the last one.
- **`REPEATED_CLICK_VISUAL_LOOKAHEAD_PAGES`** — how far ahead of the deck's
  current destination a rapid repeated click lands, in pages: clicks pick each
  other up and the deck moves continuously while the burst holds, then settles
  one lookahead past its end. Must not exceed `RENDER_WINDOW_BUFFER_MULTIPLIER`
  (diagnosed), or a repeat click would mount slides into the moving track layer.
