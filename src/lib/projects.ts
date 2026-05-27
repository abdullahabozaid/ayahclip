import { get, set, del, keys, getMany } from "idb-keyval";
import { Project } from "@/types";

const PROJECT_PREFIX = "project:";

function projectKey(id: string): string {
  return `${PROJECT_PREFIX}${id}`;
}

// IndexedDB is unavailable in some contexts (Safari private mode, exhausted
// quota). Reads degrade to "nothing stored"; writes are best-effort so autosave
// never crashes the editor.
function warnStorage(op: string, err: unknown): void {
  console.warn(`[projects] storage ${op} failed — persistence disabled`, err);
}

export async function saveProject(project: Project): Promise<void> {
  try {
    await set(projectKey(project.id), project);
  } catch (err) {
    warnStorage("saveProject", err);
  }
}

export async function getProject(id: string): Promise<Project | undefined> {
  try {
    return await get(projectKey(id));
  } catch (err) {
    warnStorage("getProject", err);
    return undefined;
  }
}

export async function deleteProject(id: string): Promise<void> {
  try {
    await del(projectKey(id));
    // Drop any uploaded media blobs that belonged to this project.
    await del(`audio:${id}`).catch(() => {});
    await del(`video:${id}`).catch(() => {});
  } catch (err) {
    warnStorage("deleteProject", err);
  }
}

// ---- Uploaded-media blobs (audio track / background video) for imported clips ----
export async function saveBlob(key: string, blob: Blob): Promise<void> {
  try {
    await set(key, blob);
  } catch (err) {
    warnStorage("saveBlob", err);
  }
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  try {
    return await get(key);
  } catch (err) {
    warnStorage("getBlob", err);
    return undefined;
  }
}

export async function getAllProjects(): Promise<Project[]> {
  try {
    const allKeys = await keys();
    const projectKeys = allKeys.filter((k) =>
      String(k).startsWith(PROJECT_PREFIX)
    );
    if (projectKeys.length === 0) return [];
    const projects = await getMany(projectKeys);
    return projects
      .filter(Boolean)
      .sort((a: Project, b: Project) => b.updatedAt - a.updatedAt);
  } catch (err) {
    warnStorage("getAllProjects", err);
    return [];
  }
}

export function generateProjectId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
