import type { ReactElement } from "react";
import { z } from "zod";

import { CLASS_NAME_KEYS } from "./classKeys";

/**
 * Public Zod schemas for host-side runtime validation of external data
 * (API responses, CMS payloads, user config) before it is handed to the
 * carousel. The carousel itself stays dumb and does not import this module.
 */

const createReactElementSchema = () =>
  z.custom<ReactElement>((value) => {
    if (typeof value !== "object" || value === null) return false;
    const sigil = (value as { $$typeof?: unknown }).$$typeof;
    return (
      sigil === Symbol.for("react.element") ||
      sigil === Symbol.for("react.transitional.element")
    );
  });

export const ReactElementSchema =
  /* @__PURE__ */ createReactElementSchema();

const createContentSchema = () =>
  z.union([
    z.string().trim().min(1),
    z.number(),
    ReactElementSchema,
  ]);

export const ContentSchema = /* @__PURE__ */ createContentSchema();

const createClassMapShape = () => {
  const shape = {} as Record<
    (typeof CLASS_NAME_KEYS)[number],
    ReturnType<typeof z.string>
  >;

  for (const key of CLASS_NAME_KEYS) {
    shape[key] = z.string();
  }

  return shape;
};

const createClassMapSchema = () =>
  z.object(createClassMapShape()).partial();

export const ClassMapSchema = /* @__PURE__ */ createClassMapSchema();

const createSlideSchema = () =>
  z.object({
    id: z.union([z.string(), z.number()]),
    content: ContentSchema,
    alt: z.string().optional(),
  });

export const SlideSchema = /* @__PURE__ */ createSlideSchema();

const createCarouselStatusSnapshotSchema = () =>
  z.object({
    isIdle: z.boolean(),
    currentPageIndex: z.number(),
    pageCount: z.number(),
    isAtStart: z.boolean(),
    isAtEnd: z.boolean(),
  });

export const CarouselStatusSnapshotSchema =
  /* @__PURE__ */ createCarouselStatusSnapshotSchema();

const createOnSlideClickSchema = () =>
  z.function({
    input: [SlideSchema],
    output: z.void(),
  });

const OnSlideClickSchema = /* @__PURE__ */ createOnSlideClickSchema();

const createOnCarouselStatusChangeSchema = () =>
  z.function({
    input: [CarouselStatusSnapshotSchema],
    output: z.void(),
  });

const OnCarouselStatusChangeSchema =
  /* @__PURE__ */ createOnCarouselStatusChangeSchema();

const createUserEnvironmentSchema = () =>
  z
    .object({
      reducedMotion: z.boolean(),
      touch: z.boolean(),
      dataSaver: z.boolean(),
    })
    .partial();

export const UserEnvironmentSchema =
  /* @__PURE__ */ createUserEnvironmentSchema();

const createCarouselPropsSchema = () =>
  z.object({
    slidesData: z.array(SlideSchema),
    visibleSlidesNr: z.number().optional(),
    isPagePaddingOn: z.boolean().optional(),
    durationAutoplay: z.number().optional(),
    intervalAutoplay: z.number().optional(),
    durationStep: z.number().optional(),
    jumpSpeedMultiplier: z.number().optional(),
    isContentImg: z.boolean().optional(),
    errAltPlaceholder: z.string().optional(),
    isAuto: z.boolean().optional(),
    isPaginationOn: z.boolean().optional(),
    isInteractive: z.boolean().optional(),
    isFinite: z.boolean().optional(),
    isControlsOn: z.boolean().optional(),
    className: ClassMapSchema.optional(),
    userEnvironment: UserEnvironmentSchema.optional(),
    onSlideClick: OnSlideClickSchema.optional(),
    onCarouselStatusChange: OnCarouselStatusChangeSchema.optional(),
  });

export const CarouselPropsSchema =
  /* @__PURE__ */ createCarouselPropsSchema();

const createCarouselSlidesDataSchema = () => CarouselPropsSchema.shape.slidesData;

export const CarouselSlidesDataSchema =
  /* @__PURE__ */ createCarouselSlidesDataSchema();
