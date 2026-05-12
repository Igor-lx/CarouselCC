import { memo, useEffect } from "react";

import {
  useGroupedDevNotice,
} from "../../../../shared";
import { useCarouselDiagnosticContext } from "../../context";
import type { CarouselSlotComponent } from "../../slots";
import { resolveCarouselDiagnostic } from "./resolveDiagnostic";
import { usePerfectPageLayoutNotice, useSlotAttachmentNotice } from "./notices";

const BANNER = "Carousel diagnostics enabled";

const DiagnosticBase = memo(function CarouselDiagnostic() {
  const { notices, perfectPageLayout, slotAttachment } =
    useCarouselDiagnosticContext();

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.info(BANNER);
  }, []);

  useGroupedDevNotice({
    scope: "Carousel diagnostic",
    summary: "props were normalised",
    entries: notices,
  });

  useSlotAttachmentNotice(slotAttachment);
  usePerfectPageLayoutNotice(perfectPageLayout);

  return null;
});

type DiagnosticSlot = CarouselSlotComponent<typeof DiagnosticBase, "diagnostic"> & {
  resolveDiagnostic: typeof resolveCarouselDiagnostic;
};

export const Diagnostic: DiagnosticSlot = Object.assign(DiagnosticBase, {
  slot: "diagnostic" as const,
  resolveDiagnostic: resolveCarouselDiagnostic,
});

export default Diagnostic;
