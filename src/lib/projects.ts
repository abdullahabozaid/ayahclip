import { get, set, del, keys, getMany } from "idb-keyval";
import { Project } from "@/types";

const PROJECT_PREFIX = "project:";

function projectKey(id: string): string {
  return `${PROJECT_PREFIX}${id}`;
}

export async function saveProject(project: Project): Promise<void> {
  await set(projectKey(project.id), project);
}

export async function getProject(id: string): Promise<Project | undefined> {
  return get(projectKey(id));
}

export async function deleteProject(id: string): Promise<void> {
  await del(projectKey(id));
}

export async function getAllProjects(): Promise<Project[]> {
  const allKeys = await keys();
  const projectKeys = allKeys.filter((k) =>
    String(k).startsWith(PROJECT_PREFIX)
  );
  if (projectKeys.length === 0) return [];
  const projects = await getMany(projectKeys);
  return projects
    .filter(Boolean)
    .sort((a: Project, b: Project) => b.updatedAt - a.updatedAt);
}

export function generateProjectId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
