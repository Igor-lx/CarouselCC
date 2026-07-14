import { buildCarouselConfig } from "../src/components/Carousel/client/config/buildConfig";
import { buildCarouselLayout, buildSlideRecords } from "../src/components/Carousel/client/domain";
import { buildInitialState } from "../src/components/Carousel/client/state/initial";
import { carouselReducer } from "../src/components/Carousel/client/state/reducer";
import { buildCarouselSegment } from "../src/components/Carousel/client/motion/segmentFactory";
import { profileProgressStops } from "../src/shared";
import type { Slide } from "../src/components/Carousel/client/public-api/types";

const config = buildCarouselConfig({ durationStep: 2000 });
const slides: Slide[] = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, content: `c${i}` }));
const layout = buildCarouselLayout(buildSlideRecords(slides), 1, false);

const ride = (uiVelocity: number, pointerVelocity: number, from: number) => {
  const dragging = carouselReducer(buildInitialState(layout), {
    type: "START_DRAG", fromVirtualIndex: 0, targetPageIndex: 0,
    context: { layout, config, isInstantMode: false },
  } as never);
  const state = carouselReducer(dragging, {
    type: "END_DRAG", fromVirtualIndex: from, targetPageIndex: 1, targetVirtualIndex: 1,
    isSnap: false, pointerReleaseVelocity: pointerVelocity, uiReleaseVelocity: uiVelocity,
    releasedAt: 0,
    context: { layout, config, isInstantMode: false },
  } as never);
  const { segment } = buildCarouselSegment({
    state, config, isInstantMode: false,
    start: { position: state.fromVirtualIndex, velocity: 0, strategy: "idle" },
    startedAt: 0,
  });
  const stops = profileProgressStops(segment.profile, segment.to - segment.from);
  return { segment, stops };
};

const show = (label: string, uiV: number, pV: number, from: number) => {
  const { segment, stops } = ride(uiV, pV, from);
  const dist = Math.abs(segment.to - segment.from);
  const dt = segment.duration / (stops.length - 1);
  console.log(`\n=== ${label}  dist=${dist.toFixed(3)}u  dur=${segment.duration.toFixed(0)}ms  ${stops.length} stops (${dt.toFixed(0)}ms each) ===`);
  let frozen = 0, maxJump = 0, jumpAt = 0;
  const vel: number[] = [];
  for (let i = 1; i < stops.length; i++) {
    const dProg = stops[i]! - stops[i - 1]!;
    vel.push(dProg);
    if (dProg <= 1e-9) frozen++;
  }
  for (let i = 1; i < vel.length; i++) {
    const prev = vel[i - 1]!, cur = vel[i]!;
    if (prev > 1e-6) {
      const jump = Math.abs(cur - prev) / prev;
      if (jump > maxJump) { maxJump = jump; jumpAt = i; }
    }
  }
  console.log("  per-stop travel (share of distance):");
  console.log("   ", vel.map(v => (v * 100).toFixed(1)).join(" "));
  console.log(`  FROZEN stops (zero travel): ${frozen}${frozen ? "   <<<<<< DECK STANDS STILL" : ""}`);
  console.log(`  biggest velocity jump between stops: ${(maxJump * 100).toFixed(0)}% at stop ${jumpAt}/${vel.length} (${((jumpAt / vel.length) * 100).toFixed(0)}% of ride)`);
};

show("slow calm swipe", 0.0008, 0.0008, -0.35);
show("medium swipe", 0.0025, 0.004, -0.30);
show("fast flick", 0.006, 0.012, -0.25);
show("very fast flick (floor kicks in)", 0.02, 0.05, -0.06);
