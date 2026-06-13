import { StyleSettings } from "./style";

export interface SavedStyle {
  id: string;
  name: string;
  settings: Partial<StyleSettings>;
}

const KEY = "ayahclip:saved-styles";

export function getSavedStyles(): SavedStyle[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedStyle[]) : [];
  } catch {
    return [];
  }
}

function persist(styles: SavedStyle[]) {
  localStorage.setItem(KEY, JSON.stringify(styles));
}

export function saveStyle(name: string, settings: Partial<StyleSettings>): SavedStyle[] {
  const styles = getSavedStyles();
  const style: SavedStyle = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || `Style ${styles.length + 1}`,
    settings,
  };
  const next = [style, ...styles];
  persist(next);
  return next;
}

export function updateSavedStyle(
  id: string,
  patch: Partial<Pick<SavedStyle, "name" | "settings">>
): SavedStyle[] {
  const next = getSavedStyles().map((s) => (s.id === id ? { ...s, ...patch } : s));
  persist(next);
  return next;
}

export function deleteSavedStyle(id: string): SavedStyle[] {
  const next = getSavedStyles().filter((s) => s.id !== id);
  persist(next);
  return next;
}
