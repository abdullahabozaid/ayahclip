// The Clip Library catalog: curated, ready-made example clips (a real passage +
// reciter + style + optional B-roll). Each one previews live and can be opened
// in the studio to change the reciter / verses / B-roll / anything, or rendered
// straight to an MP4. See docs/superpowers/specs/2026-07-21-clip-library-design.md.
import type { Background } from "@/types";
import type { TemplateDefinition } from "./template-model";
import { fetchSurahs, fetchVerses } from "./api";
import { getTranslationLanguage } from "./translations";
import { useAppStore } from "./store";
import { getBuiltInTemplate } from "./templates";
import { applyTemplate } from "./apply-template";
import { createBackgroundScene } from "./background-sequence";
import { getReciter } from "./reciters";
import { renderClipFile, type RenderedFile } from "./clip-export";

export interface ExampleClip {
  id: string;
  /** Plain title, e.g. "Ar-Rahman 13-16". */
  title: string;
  /** Plain one-line description. */
  description: string;
  featured?: boolean;
  tags?: string[];
  // What is recited:
  surah: number;
  ayahStart: number;
  ayahEnd: number;
  // Who recites it (a reciters.ts id):
  reciterId: string;
  // How it looks (a built-in template id — carries the style + extras):
  styleTemplateId: string;
  /** Optional concrete B-roll. One background → a single background; several →
   *  a background sequence. Preset/asset backgrounds only (shareable). */
  broll?: Background[];
}

/** Inclusive integer range [from, to]. */
export function exampleClipVerseNumbers(clip: Pick<ExampleClip, "ayahStart" | "ayahEnd">): number[] {
  const from = Math.min(clip.ayahStart, clip.ayahEnd);
  const to = Math.max(clip.ayahStart, clip.ayahEnd);
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

/** The style template behind an example clip (undefined if the id is stale). */
export function resolveExampleClipTemplate(clip: Pick<ExampleClip, "styleTemplateId">): TemplateDefinition | undefined {
  return getBuiltInTemplate(clip.styleTemplateId);
}

const KAABA: Background = { type: "image", value: "/backgrounds/artistic-kaaba-courtyard.webp", label: "Kaaba courtyard" };
const PRAYER_ROWS: Background = { type: "image", value: "/backgrounds/artistic-prayer-rows.webp", label: "Prayer rows" };
const MOSQUE: Background = { type: "image", value: "/backgrounds/mosque-silhouette.svg", label: "Mosque silhouette" };
const NIGHT_STARS: Background = { type: "image", value: "/backgrounds/night-stars.svg", label: "Night stars" };
const DESERT: Background = { type: "image", value: "/backgrounds/desert-dunes.svg", label: "Desert dunes" };

export const EXAMPLE_CLIPS: ExampleClip[] = [
  {
    id: "fatihah-clean",
    title: "Al-Fatihah 1-7",
    description: "The opening chapter, clean captions.",
    featured: true,
    tags: ["clean", "alafasy", "short"],
    surah: 1, ayahStart: 1, ayahEnd: 7,
    reciterId: "alafasy",
    styleTemplateId: "clean-ink",
  },
  {
    id: "rahman-golden",
    title: "Ar-Rahman 13-16",
    description: "The recurring refrain, gold highlight over B-roll.",
    featured: true,
    tags: ["golden", "minshawi", "broll"],
    surah: 55, ayahStart: 13, ayahEnd: 16,
    reciterId: "minshawi-murattal",
    styleTemplateId: "text-golden-highlight",
    broll: [KAABA, PRAYER_ROWS],
  },
  {
    id: "kursi-midnight",
    title: "Ayat al-Kursi",
    description: "The Throne verse, deep night style.",
    featured: true,
    tags: ["sudais", "midnight"],
    surah: 2, ayahStart: 255, ayahEnd: 255,
    reciterId: "sudais",
    styleTemplateId: "midnight-amiri",
    broll: [NIGHT_STARS],
  },
  {
    id: "mulk-opening",
    title: "Al-Mulk 1-2",
    description: "The opening of Al-Mulk, translation led.",
    tags: ["maher", "translation"],
    surah: 67, ayahStart: 1, ayahEnd: 2,
    reciterId: "maher-muaiqly",
    styleTemplateId: "translation-led",
  },
  {
    id: "ikhlas-big",
    title: "Al-Ikhlas 1-4",
    description: "Purity of faith, one big line at a time.",
    tags: ["basit", "short"],
    surah: 112, ayahStart: 1, ayahEnd: 4,
    reciterId: "basit-murattal",
    styleTemplateId: "big-verse",
  },
  {
    id: "falaq-warm",
    title: "Al-Falaq 1-5",
    description: "Seeking refuge, warm glow.",
    tags: ["hudhaify", "warm"],
    surah: 113, ayahStart: 1, ayahEnd: 5,
    reciterId: "hudhaify",
    styleTemplateId: "warm-glow",
    broll: [DESERT],
  },
  {
    id: "nas-bold",
    title: "An-Nas 1-6",
    description: "The final chapter, bold Naskh.",
    tags: ["juhany", "bold"],
    surah: 114, ayahStart: 1, ayahEnd: 6,
    reciterId: "juhany",
    styleTemplateId: "bold-naskh-impact",
  },
  {
    id: "kahf-emerald",
    title: "Al-Kahf 1-4",
    description: "The opening of Al-Kahf, emerald glow over B-roll.",
    tags: ["yasser", "broll"],
    surah: 18, ayahStart: 1, ayahEnd: 4,
    reciterId: "yasser-dossary",
    styleTemplateId: "emerald-glow",
    broll: [MOSQUE, KAABA],
  },
  {
    id: "duha-gold",
    title: "Ad-Duha 1-5",
    description: "The morning hours, gold line.",
    tags: ["alafasy", "gold"],
    surah: 93, ayahStart: 1, ayahEnd: 5,
    reciterId: "alafasy",
    styleTemplateId: "ayahclip-gold-line",
  },
  {
    id: "asr-cinematic",
    title: "Al-Asr 1-3",
    description: "By time, cinematic letterbox over B-roll.",
    tags: ["sudais", "cinematic", "broll"],
    surah: 103, ayahStart: 1, ayahEnd: 3,
    reciterId: "sudais",
    styleTemplateId: "cinematic-letterbox",
    broll: [PRAYER_ROWS, MOSQUE],
  },
];

/** Apply the clip's B-roll to the store: one background stays single, several
 *  become a sequence. Mirrors applyTemplate's scene-setState shape. */
function applyExampleBroll(broll: Background[] | undefined): void {
  const store = useAppStore.getState();
  if (!broll || broll.length === 0) return;
  if (broll.length === 1) {
    useAppStore.setState({ backgroundSequenceEnabled: false, backgroundScenes: [], activeBackgroundSceneId: null });
    store.setBackground({ ...broll[0] });
    return;
  }
  const scenes = broll.map((background) => createBackgroundScene({ ...background }, { duration: 5 }));
  useAppStore.setState({
    backgroundSequenceEnabled: true,
    backgroundScenes: scenes,
    activeBackgroundSceneId: scenes[0].id,
    background: { ...scenes[0].background },
    backgroundFit: scenes[0].fit,
    fitBackdrop: scenes[0].backdrop,
    mediaTransform: { ...scenes[0].transform },
  });
}

/**
 * Load an example clip into the store: fresh project, its surah + verse range,
 * its reciter, its style template, and its B-roll. After this the studio shows
 * the composed clip with every option editable. Throws if the clip references a
 * stale template/surah id (guarded by the catalog integrity test).
 */
export async function hydrateExampleClip(clip: ExampleClip): Promise<void> {
  const template = resolveExampleClipTemplate(clip);
  if (!template) throw new Error(`Example clip "${clip.id}" references unknown template "${clip.styleTemplateId}".`);
  const lang = getTranslationLanguage(useAppStore.getState().translationLanguage);
  const [surahs, verses] = await Promise.all([
    fetchSurahs(),
    fetchVerses(clip.surah, lang.resourceId),
  ]);
  const surah = surahs.find((item) => item.id === clip.surah);
  if (!surah) throw new Error(`Example clip "${clip.id}" references unknown surah ${clip.surah}.`);
  if (verses.length === 0) throw new Error(`No verses returned for surah ${clip.surah}.`);

  // Fresh identity first, so this never overwrites a previously opened saved clip.
  useAppStore.getState().beginNewProject();
  const store = useAppStore.getState();
  store.setSurah(surah);
  store.setVerses(verses);
  store.setSelectedVerseNumbers(exampleClipVerseNumbers(clip));
  store.setReciterId(clip.reciterId);
  applyTemplate(template, { replaceMedia: true });
  applyExampleBroll(clip.broll);
}

/**
 * Hydrate the clip then render its MP4 with the existing export pipeline. The
 * caller triggers the actual browser download from the returned file. Safe to
 * run off the studio page — autosave only runs inside the studio.
 */
export async function renderExampleClip(
  clip: ExampleClip,
  onProgress: (current: number, total: number) => void,
): Promise<RenderedFile | null> {
  await hydrateExampleClip(clip);
  return renderClipFile(onProgress);
}

/** True when the id resolves to a real reciter — used by the catalog test. */
export function exampleClipReciterExists(clip: Pick<ExampleClip, "reciterId">): boolean {
  return getReciter(clip.reciterId) !== undefined;
}
