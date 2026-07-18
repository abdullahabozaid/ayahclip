export const FONT_WEIGHT_OPTIONS = [
  { value: 400, label: "Regular" },
  { value: 500, label: "Medium" },
  { value: 600, label: "SemiBold" },
  { value: 700, label: "Bold" },
] as const;

export const TRANSLATION_FONT_OPTIONS = [
  { value: "outfit", label: "Outfit" },
  { value: "serif", label: "Georgia (Serif)" },
  { value: "sans-serif", label: "Arial (Sans)" },
  { value: "cinzel", label: "Cinzel" },
  { value: "times-new-roman", label: "Times New Roman" },
  { value: "lora", label: "Lora" },
  { value: "playfair-display", label: "Playfair Display" },
] as const;

export const ARABIC_FONT_OPTIONS = [
  {
    value: "qcf",
    label: "Mushaf QCF",
    defaultWeight: 400,
    note: "Page-faithful Quran glyphs with the authentic ayah mark.",
  },
  {
    value: "uthmanic-hafs",
    label: "QPC Hafs Unicode",
    defaultWeight: 400,
    note: "Source-matched Quran Foundation Hafs text with complete marks.",
  },
  {
    value: "amiri-quran",
    label: "Amiri Quran",
    defaultWeight: 400,
    note: "Open, literary Naskh for cinematic captions.",
  },
  {
    value: "scheherazade-new",
    label: "Scheherazade New",
    defaultWeight: 600,
    note: "Traditional Naskh with genuine Regular through Bold faces.",
  },
  {
    value: "noto-naskh-arabic",
    label: "Noto Naskh Arabic",
    defaultWeight: 700,
    note: "Compact multi-weight Naskh for bold social captions with dense marks.",
  },
] as const;
