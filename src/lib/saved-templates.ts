import type { Background } from "@/types";
import type { SavedStyle } from "./saved-styles";
import type { StyleSettings } from "./style";
import {
  TEMPLATE_SCHEMA_VERSION,
  type SavedTemplate,
  type TemplateDefinition,
  type TemplateFamily,
  type TemplateMediaPolicy,
  type TemplateMediaSlot,
  type TemplateExtras,
} from "./template-model";

export const SAVED_TEMPLATES_KEY = "ayahclip:saved-templates:v1";
const LEGACY_STYLES_KEY = "ayahclip:saved-styles";
const MIGRATION_KEY = "ayahclip:saved-templates:migrated-v1";

export interface SaveTemplateInput {
  name: string;
  description?: string;
  family?: TemplateFamily;
  swatch?: string;
  mediaPolicy: TemplateMediaPolicy;
  settings: StyleSettings;
  extras?: TemplateExtras;
  mediaSlots?: TemplateMediaSlot[];
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.localStorage;
}

function isTransientMedia(value: string): boolean {
  return value.startsWith("blob:") || value.startsWith("data:");
}

function sanitizeBackground(
  background: Background,
  slots: TemplateMediaSlot[]
): Background {
  if (
    (background.type === "image" || background.type === "video") &&
    isTransientMedia(background.value)
  ) {
    if (!slots.some((slot) => slot.id === "background")) {
      slots.push({
        id: "background",
        accepts: background.type,
        label: background.label || "Add your media",
      });
    }
    return { type: "solid", value: "#08090d", label: "Add your media" };
  }
  return { ...background };
}

/**
 * Local blob/data URLs cannot survive a reload. Replace them with an explicit
 * media slot while preserving the composition, fit, and typography settings.
 */
export function sanitizeTemplateForStorage(
  input: SaveTemplateInput
): Pick<SaveTemplateInput, "settings" | "mediaSlots"> {
  const mediaSlots = [...(input.mediaSlots ?? [])];
  const settings: StyleSettings = {
    ...input.settings,
    background: sanitizeBackground(input.settings.background, mediaSlots),
    textShadow: { ...input.settings.textShadow },
    textOutline: input.settings.textOutline
      ? { ...input.settings.textOutline }
      : undefined,
    letterbox: { ...input.settings.letterbox },
    mediaTransform: input.settings.mediaTransform
      ? { ...input.settings.mediaTransform }
      : undefined,
    mediaFrame: input.settings.mediaFrame
      ? { ...input.settings.mediaFrame }
      : undefined,
    splitMask: input.settings.splitMask
      ? { ...input.settings.splitMask }
      : undefined,
  };
  return { settings, mediaSlots };
}

function validFamily(value: unknown): value is TemplateFamily {
  return ["ayahclip", "reciter", "nature", "minimal", "broll"].includes(
    String(value)
  );
}

function validPolicy(value: unknown): value is TemplateMediaPolicy {
  return value === "preserve-current-media" || value === "use-template-media";
}

function parseTemplate(value: unknown): SavedTemplate | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<SavedTemplate>;
  if (
    item.schemaVersion !== TEMPLATE_SCHEMA_VERSION ||
    item.source !== "user" ||
    typeof item.id !== "string" ||
    typeof item.name !== "string" ||
    !validFamily(item.family) ||
    !validPolicy(item.mediaPolicy) ||
    !item.settings ||
    typeof item.settings !== "object" ||
    !item.settings.background ||
    !item.settings.textShadow ||
    !item.settings.letterbox
  ) {
    return null;
  }
  return {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    id: item.id,
    source: "user",
    name: item.name,
    description: typeof item.description === "string" ? item.description : "",
    family: item.family,
    featured: Boolean(item.featured),
    swatch: typeof item.swatch === "string" ? item.swatch : "#08090d",
    mediaPolicy: item.mediaPolicy,
    settings: item.settings as StyleSettings,
    extras: item.extras && typeof item.extras === "object" ? item.extras : {},
    mediaSlots: Array.isArray(item.mediaSlots) ? item.mediaSlots : [],
    createdAt: typeof item.createdAt === "number" ? item.createdAt : Date.now(),
    updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
  };
}

function readStored(): SavedTemplate[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(SAVED_TEMPLATES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseTemplate).filter((item): item is SavedTemplate => Boolean(item));
  } catch {
    return [];
  }
}

function persist(templates: SavedTemplate[]): void {
  storage()?.setItem(SAVED_TEMPLATES_KEY, JSON.stringify(templates));
}

function migrateLegacyStyles(baseStyle: StyleSettings): SavedTemplate[] {
  const store = storage();
  if (!store || store.getItem(MIGRATION_KEY) === "1") return [];
  let legacy: SavedStyle[] = [];
  try {
    const raw = store.getItem(LEGACY_STYLES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) legacy = parsed;
  } catch {
    legacy = [];
  }

  const now = Date.now();
  const migrated = legacy
    .filter((item) => item && typeof item.id === "string" && typeof item.name === "string")
    .map((item, index): SavedTemplate => ({
      schemaVersion: TEMPLATE_SCHEMA_VERSION,
      id: `legacy-${item.id}`,
      source: "user",
      name: item.name,
      description: "Migrated from My Styles",
      family: "minimal",
      featured: false,
      swatch: "#08090d",
      mediaPolicy: "preserve-current-media",
      settings: { ...baseStyle, ...item.settings },
      extras: {},
      mediaSlots: [],
      createdAt: now + index,
      updatedAt: now + index,
    }));

  if (migrated.length > 0) persist(migrated);
  store.setItem(MIGRATION_KEY, "1");
  return migrated;
}

export function getSavedTemplates(baseStyle: StyleSettings): SavedTemplate[] {
  const saved = readStored();
  return saved.length > 0 ? saved : migrateLegacyStyles(baseStyle);
}

export function saveTemplate(input: SaveTemplateInput): SavedTemplate[] {
  const templates = readStored();
  const now = Date.now();
  const sanitized = sanitizeTemplateForStorage(input);
  const template: SavedTemplate = {
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    id: `template-${now}-${Math.random().toString(36).slice(2, 8)}`,
    source: "user",
    name: input.name.trim() || `Template ${templates.length + 1}`,
    description: input.description?.trim() || "Custom Quran clip template",
    family: input.family ?? "minimal",
    featured: false,
    swatch: input.swatch ?? sanitized.settings.background.value,
    mediaPolicy: input.mediaPolicy,
    settings: sanitized.settings,
    extras: { ...(input.extras ?? {}) },
    mediaSlots: sanitized.mediaSlots ?? [],
    createdAt: now,
    updatedAt: now,
  };
  const next = [template, ...templates];
  persist(next);
  return next;
}

export function updateSavedTemplate(
  id: string,
  input: SaveTemplateInput
): SavedTemplate[] {
  const sanitized = sanitizeTemplateForStorage(input);
  const next = readStored().map((template) =>
    template.id === id
      ? {
          ...template,
          name: input.name.trim() || template.name,
          description: input.description?.trim() || template.description,
          family: input.family ?? template.family,
          swatch: input.swatch ?? sanitized.settings.background.value,
          mediaPolicy: input.mediaPolicy,
          settings: sanitized.settings,
          extras: { ...(input.extras ?? {}) },
          mediaSlots: sanitized.mediaSlots ?? [],
          updatedAt: Date.now(),
        }
      : template
  );
  persist(next);
  return next;
}

export function deleteSavedTemplate(id: string): SavedTemplate[] {
  const next = readStored().filter((template) => template.id !== id);
  persist(next);
  return next;
}

export function duplicateSavedTemplate(template: TemplateDefinition): SavedTemplate[] {
  return saveTemplate({
    name: `${template.name} copy`,
    description: template.description,
    family: template.family,
    swatch: template.swatch,
    mediaPolicy: template.mediaPolicy,
    settings: template.settings,
    extras: template.extras,
    mediaSlots: template.mediaSlots,
  });
}
