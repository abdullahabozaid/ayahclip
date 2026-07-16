import type { Background } from "@/types";
import type { FitBackdrop, MediaFit, MediaTransform } from "./canvas-utils";

export type BackgroundTransition = "cut" | "crossfade";

export interface BackgroundScene {
  id: string;
  background: Background;
  /** Seconds this scene stays on screen before the next scene begins. */
  duration: number;
  /** Transition at the end of this scene. */
  transition: BackgroundTransition;
  transitionDuration: number;
  fit: MediaFit;
  backdrop: FitBackdrop;
  transform: MediaTransform;
}

export interface ResolvedBackgroundScene {
  index: number;
  scene: BackgroundScene;
  localTime: number;
  next?: BackgroundScene;
  /** 0 until a crossfade begins, then 0..1 through the transition. */
  transitionProgress: number;
}

export function createBackgroundScene(
  background: Background,
  options: Partial<Omit<BackgroundScene, "id" | "background">> = {}
): BackgroundScene {
  return {
    id: `scene-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    background,
    duration: options.duration ?? 5,
    transition: options.transition ?? "crossfade",
    transitionDuration: options.transitionDuration ?? 0.6,
    fit: options.fit ?? "cover",
    backdrop: options.backdrop ?? "blur",
    transform: options.transform ?? { scale: 1, x: 0, y: 0 },
  };
}

export function sequenceDuration(scenes: BackgroundScene[]): number {
  return scenes.reduce((sum, scene) => sum + Math.max(0.1, scene.duration), 0);
}

/** Resolve a looping B-roll sequence at an output-timeline time. */
export function resolveBackgroundScene(
  scenes: BackgroundScene[],
  timeSeconds: number
): ResolvedBackgroundScene | undefined {
  if (scenes.length === 0) return undefined;
  const total = sequenceDuration(scenes);
  let cursor = ((Math.max(0, timeSeconds) % total) + total) % total;
  let index = 0;
  for (; index < scenes.length - 1; index++) {
    const duration = Math.max(0.1, scenes[index].duration);
    if (cursor < duration) break;
    cursor -= duration;
  }

  const scene = scenes[index];
  const duration = Math.max(0.1, scene.duration);
  const transitionDuration = scene.transition === "crossfade"
    ? Math.min(duration / 2, Math.max(0.1, scene.transitionDuration))
    : 0;
  const transitionStart = duration - transitionDuration;
  const transitionProgress = transitionDuration > 0 && cursor > transitionStart
    ? Math.min(1, (cursor - transitionStart) / transitionDuration)
    : 0;

  return {
    index,
    scene,
    localTime: cursor,
    next: transitionProgress > 0 ? scenes[(index + 1) % scenes.length] : undefined,
    transitionProgress,
  };
}

export function moveBackgroundScene(
  scenes: BackgroundScene[],
  id: string,
  direction: -1 | 1
): BackgroundScene[] {
  const from = scenes.findIndex((scene) => scene.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= scenes.length) return scenes;
  const next = [...scenes];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}
