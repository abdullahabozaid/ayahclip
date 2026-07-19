import { fetchSurahs, fetchVerses } from "./api";
import { applyTemplate } from "./apply-template";
import { loadBulkJob, loadBulkSource } from "./bulk-jobs";
import { isSupportedVideoFile } from "./media-file";
import { getSavedTemplates } from "./saved-templates";
import { useAppStore } from "./store";
import { DEFAULT_TEMPLATE_STYLE, TEMPLATES } from "./templates";

let activeBulkObjectUrls: string[] = [];

export interface BulkStudioNavigation {
  jobId: string;
  candidateId: string;
  index: number;
  total: number;
  previousId?: string;
  nextId?: string;
}

export async function openBulkCandidateInStudio(jobId: string, candidateId: string): Promise<BulkStudioNavigation> {
  const [job, stored, surahs] = await Promise.all([
    loadBulkJob(jobId),
    loadBulkSource(jobId),
    fetchSurahs(),
  ]);
  if (!job || !stored) throw new Error("This bulk collection is no longer available in this browser.");
  const index = job.candidates.findIndex((candidate) => candidate.id === candidateId);
  const candidate = job.candidates[index];
  if (!candidate) throw new Error("This clip is no longer part of the collection.");
  const surah = surahs.find((item) => item.id === candidate.surah);
  if (!surah) throw new Error("The Surah details could not be loaded.");
  const verses = job.verses.some((verse) => verse.verse_key.startsWith(`${candidate.surah}:`))
    ? job.verses.filter((verse) => verse.verse_key.startsWith(`${candidate.surah}:`))
    : await fetchVerses(candidate.surah);
  const source = new File([stored.source], job.sourceName, { type: job.sourceType });
  activeBulkObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  const sourceUrl = URL.createObjectURL(source);
  const audioUrl = URL.createObjectURL(stored.audio);
  activeBulkObjectUrls = [sourceUrl, audioUrl];
  const store = useAppStore.getState();
  store.beginNewProject();
  store.setSurah(surah);
  store.setVerses(verses);
  store.setSelectedVerseNumbers(candidate.timings.map((timing) => timing.verseNumber));
  store.setCurrentVerseIndex(0);
  store.setImportedAudio(audioUrl, `${job.sourceName} · clip ${candidate.order}`, candidate.timings.map((item) => {
    const timing = { ...item };
    delete (timing as Partial<typeof timing>).surah;
    delete (timing as Partial<typeof timing>).confidence;
    delete (timing as Partial<typeof timing>).sourceWindow;
    return timing;
  }));
  store.setBackground({ ...DEFAULT_TEMPLATE_STYLE.background });
  store.setBackgroundFit(DEFAULT_TEMPLATE_STYLE.backgroundFit ?? "cover");
  store.setFitBackdrop(DEFAULT_TEMPLATE_STYLE.fitBackdrop ?? "black");
  if (isSupportedVideoFile(source)) {
    store.setBackground({ type: "video", value: sourceUrl, label: job.sourceName });
    store.setBackgroundFit("cover");
    store.setBackgroundVideoSync(true);
  }
  const template = [...TEMPLATES, ...getSavedTemplates(DEFAULT_TEMPLATE_STYLE)].find((item) => item.id === candidate.templateId);
  if (template) applyTemplate(template);
  return {
    jobId,
    candidateId,
    index,
    total: job.candidates.length,
    previousId: job.candidates[index - 1]?.id,
    nextId: job.candidates[index + 1]?.id,
  };
}
