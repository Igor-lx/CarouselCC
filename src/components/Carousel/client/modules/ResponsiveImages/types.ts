export interface ResponsiveImagesProps {
  /**
   * Decode the buffered slides' bitmaps ahead of time.
   *
   * A `.webp` on the wire is compressed bytes; painting it needs those bytes
   * unpacked into raw pixels, which for a full-size crop is megabytes of work.
   * Left alone, that unpacking lands in the frame the slide is first painted
   * — mid-ride, on the weakest device, exactly where a held frame shows. This
   * flag moves it into an idle callback beforehand.
   *
   * The decode runs on a DETACHED copy of the file the rendered element has
   * already chosen, and the copy is then released: decoding the on-screen
   * element itself would pin its bitmap for the element's whole life, and a
   * window of pinned decodes measurably squeezed the GPU raster budget on
   * weak devices. Released, the result lives in the browser's own cache,
   * which is free to evict it — predecode is best-effort by construction,
   * never a guarantee.
   *
   * There is no preload switch beside it: the render window IS the preload
   * window (see the module's own doc comment).
   *
   * Default `false` — it trades memory pressure for a smoother ride, and
   * which side of that trade a device wants is not knowable here. Measure.
   */
  isPredecodeOn?: boolean;
}
