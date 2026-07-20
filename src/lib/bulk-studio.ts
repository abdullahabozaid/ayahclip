import { fetchSurahs, fetchVerses } from "./api";
import { applyTemplate } from "./apply-template";
import { deleteBulkOutput, loadBulkJob, loadBulkSource, saveBulkJob } from "./bulk-jobs";
import { isSupportedVideoFile } from "./media-file";
import { getSavedTemplates } from "./saved-templates";
import { applyStyleSnapshot, captureDurableStyleSnapshot } from "./style-snapshot";
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
  // With source visuals the clip's media is the imported video: the template
  // may only restyle it unless the batch explicitly opted into replacement.
  if (template) {
    applyTemplate(template, job.visualMode === "template"
      ? undefined
      : { replaceMedia: job.templateReplacesMedia === true });
  }
  if (job.styleOverride) applyStyleSnapshot(job.styleOverride);
  // The clip's OWN saved look wins last: an individual clip edited in Studio
  // must reopen exactly as the creator left it, not as the batch default.
  if (candidate.styleOverride) applyStyleSnapshot(candidate.styleOverride);
  return {
    jobId,
    candidateId,
    index,
    total: job.candidates.length,
    previousId: job.candidates[index - 1]?.id,
    nextId: job.candidates[index + 1]?.id,
  };
}

/**
 * Persist the studio's current look onto ONE bulk candidate so it survives
 * leaving and reopening the collection. Called when the creator navigates
 * away from a bulk clip (back to the collection, or to a sibling clip).
 * The clip's render (if any) is now stale, so its render task resets and the
 * cached output is dropped — mirroring the batch-wide "apply look" behaviour.
 */
export async function persistBulkCandidateLook(jobId: string, candidateId: string): Promise<void> {
  const job = await loadBulkJob(jobId);
  if (!job) return;
  const index = job.candidates.findIndex((candidate) => candidate.id === candidateId);
  if (index === -1) return;
  const snapshot = captureDurableStyleSnapshot();
  const candidates = job.candidates.map((candidate) =>
    candidate.id === candidateId ? { ...candidate, styleOverride: snapshot } : candidate,
  );
  const renderTasks = job.renderTasks.map((task) =>
    task.candidateId === candidateId
      ? { candidateId: task.candidateId, status: "idle" as const, progress: 0 }
      : task,
  );
  await saveBulkJob({ ...job, candidates, renderTasks });
  await deleteBulkOutput(jobId, candidateId).catch(() => {});
}
