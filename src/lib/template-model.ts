import type { BackgroundTransition } from "./background-sequence";
import type { StyleSettings } from "./style";

export const TEMPLATE_SCHEMA_VERSION = 1 as const;

export type TemplateFamily =
  | "ayahclip"
  | "reciter"
  | "nature"
  | "minimal"
  | "broll";

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
