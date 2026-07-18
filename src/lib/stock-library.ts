export interface StockImage {
  id: string;
  name: string;
  category: "nature" | "islamic" | "night" | "abstract";
  url: string;
  thumbUrl: string;
  sourceId: number;
  sourcePageUrl: string;
  /** Manually reviewed to contain no visible people. */
  peopleFree: true;
}

const pexelsImg = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg`;

const img = (id: number, w = 1080) => `${pexelsImg(id)}?auto=compress&cs=tinysrgb&w=${w}`;

const REVIEWED_STOCK_IMAGES: Omit<StockImage, "peopleFree" | "sourcePageUrl">[] = [
  { id: "forest-1", name: "Forest", category: "nature", sourceId: 1459534, url: img(1459534), thumbUrl: img(1459534, 280) },
  { id: "forest-2", name: "Dark Forest", category: "nature", sourceId: 1671325, url: img(1671325), thumbUrl: img(1671325, 280) },
  { id: "ocean-1", name: "Ocean Waves", category: "nature", sourceId: 1646311, url: img(1646311), thumbUrl: img(1646311, 280) },
  { id: "ocean-2", name: "Sea Shore", category: "nature", sourceId: 1295138, url: img(1295138), thumbUrl: img(1295138, 280) },
  { id: "mountains-1", name: "Mountains", category: "nature", sourceId: 691668, url: img(691668), thumbUrl: img(691668, 280) },
  { id: "rain", name: "Rain Drops", category: "nature", sourceId: 110874, url: img(110874), thumbUrl: img(110874, 280) },
  { id: "desert", name: "Sand Dunes", category: "nature", sourceId: 235974, url: img(235974), thumbUrl: img(235974, 280) },
  { id: "clouds", name: "Cloudy Sky", category: "nature", sourceId: 531756, url: img(531756), thumbUrl: img(531756, 280) },
  { id: "mosque-1", name: "Blue Mosque", category: "islamic", sourceId: 2475719, url: img(2475719), thumbUrl: img(2475719, 280) },
  { id: "mosque-2", name: "Golden Interior", category: "islamic", sourceId: 13234206, url: img(13234206), thumbUrl: img(13234206, 280) },
  { id: "mosque-3", name: "Calligraphy", category: "islamic", sourceId: 8385228, url: img(8385228), thumbUrl: img(8385228, 280) },
  { id: "lanterns-1", name: "Festive Glow", category: "islamic", sourceId: 1038180, url: img(1038180), thumbUrl: img(1038180, 280) },
  { id: "geometric", name: "Geometric Pattern", category: "islamic", sourceId: 14137368, url: img(14137368), thumbUrl: img(14137368, 280) },
  { id: "stars-1", name: "Milky Way", category: "night", sourceId: 1205301, url: img(1205301), thumbUrl: img(1205301, 280) },
  { id: "stars-2", name: "Starry Desert", category: "night", sourceId: 998641, url: img(998641), thumbUrl: img(998641, 280) },
  { id: "moon", name: "Full Moon", category: "night", sourceId: 3765594, url: img(3765594), thumbUrl: img(3765594, 280) },
  { id: "aurora-1", name: "Aurora Borealis", category: "night", sourceId: 1562058, url: img(1562058), thumbUrl: img(1562058, 280) },
  { id: "aurora-2", name: "Northern Lights", category: "night", sourceId: 1938345, url: img(1938345), thumbUrl: img(1938345, 280) },
  { id: "bokeh", name: "Bokeh Lights", category: "abstract", sourceId: 342411, url: img(342411), thumbUrl: img(342411, 280) },
  { id: "sunset", name: "Sunset", category: "abstract", sourceId: 1765708, url: img(1765708), thumbUrl: img(1765708, 280) },
];

// New entries must pass the same visual review before moving into this list.
export const STOCK_IMAGES: StockImage[] = REVIEWED_STOCK_IMAGES.map((image) => ({
  ...image,
  sourcePageUrl: `https://www.pexels.com/photo/${image.sourceId}/`,
  peopleFree: true,
}));

export const STOCK_CATEGORIES = ["nature", "islamic", "night", "abstract"] as const;
