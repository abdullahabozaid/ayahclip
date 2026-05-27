import { TranslationLanguage } from "@/types";

export const TRANSLATION_LANGUAGES: TranslationLanguage[] = [
  { id: "en", name: "English", nativeName: "English", resourceId: 20, direction: "ltr" },
  { id: "fr", name: "French", nativeName: "Français", resourceId: 31, direction: "ltr" },
  { id: "tr", name: "Turkish", nativeName: "Türkçe", resourceId: 77, direction: "ltr" },
  { id: "ur", name: "Urdu", nativeName: "اردو", resourceId: 54, direction: "rtl" },
  { id: "id", name: "Indonesian", nativeName: "Bahasa Indonesia", resourceId: 33, direction: "ltr" },
  { id: "es", name: "Spanish", nativeName: "Español", resourceId: 83, direction: "ltr" },
];

export function getTranslationLanguage(id: string): TranslationLanguage {
  return TRANSLATION_LANGUAGES.find((l) => l.id === id) ?? TRANSLATION_LANGUAGES[0];
}
