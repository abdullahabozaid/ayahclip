export interface StockImage {
  id: string;
  name: string;
  category: "nature" | "islamic" | "night" | "abstract";
  url: string;
  thumbUrl: string;
}

const pexelsImg = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg`;

const img = (id: number, w = 1080) => `${pexelsImg(id)}?auto=compress&cs=tinysrgb&w=${w}`;

export const STOCK_IMAGES: StockImage[] = [
  { id: "forest-1", name: "Forest", category: "nature", url: img(1459534), thumbUrl: img(1459534, 280) },
  { id: "forest-2", name: "Dark Forest", category: "nature", url: img(1671325), thumbUrl: img(1671325, 280) },
  { id: "ocean-1", name: "Ocean Waves", category: "nature", url: img(1646311), thumbUrl: img(1646311, 280) },
  { id: "ocean-2", name: "Sea Shore", category: "nature", url: img(1295138), thumbUrl: img(1295138, 280) },
  { id: "mountains-1", name: "Mountains", category: "nature", url: img(691668), thumbUrl: img(691668, 280) },
  { id: "rain", name: "Rain Drops", category: "nature", url: img(110874), thumbUrl: img(110874, 280) },
  { id: "desert", name: "Sand Dunes", category: "nature", url: img(235974), thumbUrl: img(235974, 280) },
  { id: "clouds", name: "Cloudy Sky", category: "nature", url: img(531756), thumbUrl: img(531756, 280) },
  { id: "mosque-1", name: "Blue Mosque", category: "islamic", url: img(2475719), thumbUrl: img(2475719, 280) },
  { id: "mosque-2", name: "Golden Interior", category: "islamic", url: img(13234206), thumbUrl: img(13234206, 280) },
  { id: "mosque-3", name: "Calligraphy", category: "islamic", url: img(8385228), thumbUrl: img(8385228, 280) },
  { id: "lanterns-1", name: "Festive Glow", category: "islamic", url: img(1038180), thumbUrl: img(1038180, 280) },
  { id: "lanterns-2", name: "Turkish Lanterns", category: "islamic", url: img(13820620), thumbUrl: img(13820620, 280) },
  { id: "geometric", name: "Geometric Pattern", category: "islamic", url: img(14137368), thumbUrl: img(14137368, 280) },
  { id: "stars-1", name: "Milky Way", category: "night", url: img(1205301), thumbUrl: img(1205301, 280) },
  { id: "stars-2", name: "Starry Desert", category: "night", url: img(998641), thumbUrl: img(998641, 280) },
  { id: "moon", name: "Full Moon", category: "night", url: img(3765594), thumbUrl: img(3765594, 280) },
  { id: "aurora-1", name: "Aurora Borealis", category: "night", url: img(1562058), thumbUrl: img(1562058, 280) },
  { id: "aurora-2", name: "Northern Lights", category: "night", url: img(1938345), thumbUrl: img(1938345, 280) },
  { id: "bokeh", name: "Bokeh Lights", category: "abstract", url: img(342411), thumbUrl: img(342411, 280) },
  { id: "sunset", name: "Sunset", category: "abstract", url: img(1765708), thumbUrl: img(1765708, 280) },
];

export const STOCK_CATEGORIES = ["nature", "islamic", "night", "abstract"] as const;
