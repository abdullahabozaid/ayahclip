import type { BackgroundTransition } from "./background-sequence";
import type { StyleSettings } from "./style";

export const TEMPLATE_SCHEMA_VERSION = 1 as const;

export type TemplateFamily =
  | "ayahclip"
  | "reciter"
  | "nature"
  | "minimal"
  | "broll"
  | "text";

/**
 * "composition" (default) templates carry a full look including background and
 * media slots. "text" presets are caption/typography looks only: applying one
 * restyles the Arabic + translation (font, weight, colour, highlight, outline,
 * position) and never touches the creator's current background or media.
 */
export type TemplateKind = "composition" | "text";

export type TemplateMediaPolicy =
  | "preserve-current-media"
  | "use-template-media";

export interface TemplateSequencePreset {
  enabled: boolean;
  sceneCount: number;
  duration: number;
  transition: BackgroundTransition;
  transitionDuration: number;
}

export interface TemplateExtras {
  wordHighlight?: boolean;
  clipFadeMs?: number;
  audioFadeIn?: boolean;
  safeAreaTarget?: "none" | "tiktok" | "reels";
  safePadding?: number;
  backgroundSequence?: TemplateSequencePreset;
}

export interface TemplateMediaSlot {
  id: "background" | `scene:${number}`;
  accepts: "image" | "video" | "image-or-video";
  label: string;
}

export interface TemplateDefinition {
  id: string;
  source: "built-in" | "user";
  name: string;
  description: string;
  family: TemplateFamily;
  /** Defaults to "composition" when omitted. */
  kind?: TemplateKind;
  featured?: boolean;
  /** Small CSS background used while the real renderer preview is loading. */
  swatch: string;
  mediaPolicy: TemplateMediaPolicy;
  settings: StyleSettings;
  extras: TemplateExtras;
  mediaSlots: TemplateMediaSlot[];
}

export interface SavedTemplate extends TemplateDefinition {
  source: "user";
  schemaVersion: typeof TEMPLATE_SCHEMA_VERSION;
  createdAt: number;
  updatedAt: number;
}
