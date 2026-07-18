export type VideoCategory = "nature" | "islamic" | "abstract" | "night";

export type BrollTag =
  | "abstract"
  | "architecture"
  | "clouds"
  | "coast"
  | "drive"
  | "forest"
  | "mountains"
  | "night"
  | "rain"
  | "stars"
  | "trail"
  | "water"
  | "waterfall";

export interface VideoPreset {
  id: string;
  name: string;
  category: VideoCategory;
  videoUrl: string;
  thumbnailUrl: string | null;
  sourceId: number;
  sourcePageUrl: string;
  fileSizeBytes: number;
  tags: readonly BrollTag[];
  /** Manually reviewed across sampled frames to contain no visible people. */
  peopleFree: true;
}

type ReviewedVideoPreset = Omit<VideoPreset, "peopleFree" | "sourcePageUrl">;

function reviewedPreset(preset: ReviewedVideoPreset): VideoPreset {
  return {
    ...preset,
    sourcePageUrl: `https://www.pexels.com/video/${preset.sourceId}/`,
    peopleFree: true,
  };
}

export const VIDEO_PRESETS: VideoPreset[] = [
  reviewedPreset({
    id: "rain",
    name: "Rain on Window",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/5197762/5197762-hd_1920_1080_25fps.mp4",
    thumbnailUrl: null,
    sourceId: 5197762,
    fileSizeBytes: 25_377_827,
    tags: ["rain", "water"],
  }),
  reviewedPreset({
    id: "ocean",
    name: "Ocean Waves",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/1093652/1093652-uhd_2560_1440_30fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/1093652/free-video-1093652.jpg?auto=compress&cs=tinysrgb&w=280",
    sourceId: 1093652,
    fileSizeBytes: 14_812_363,
    tags: ["water", "coast"],
  }),
  reviewedPreset({
    id: "clouds",
    name: "Cloud Timelapse",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/856171/856171-hd_1920_1080_30fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/856171/free-video-856171.jpg?auto=compress&cs=tinysrgb&w=280",
    sourceId: 856171,
    fileSizeBytes: 8_318_387,
    tags: ["clouds"],
  }),
  reviewedPreset({
    id: "forest-1",
    name: "Sunlit Forest",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/852335/852335-hd_1920_1080_24fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/852335/free-video-852335.jpg?auto=compress&cs=tinysrgb&w=280",
    sourceId: 852335,
    fileSizeBytes: 5_260_089,
    tags: ["forest"],
  }),
  reviewedPreset({
    id: "forest-2",
    name: "Forest Canopy",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/1448735/1448735-uhd_2732_1440_24fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/1448735/free-video-1448735.jpg?auto=compress&cs=tinysrgb&w=280",
    sourceId: 1448735,
    fileSizeBytes: 51_606_931,
    tags: ["forest"],
  }),
  reviewedPreset({
    id: "islamic-bg",
    name: "Islamic Domes",
    category: "islamic",
    videoUrl: "https://videos.pexels.com/video-files/15399236/15399236-uhd_1440_2160_30fps.mp4",
    thumbnailUrl: null,
    sourceId: 15399236,
    fileSizeBytes: 8_598_548,
    tags: ["architecture"],
  }),
  reviewedPreset({
    id: "bokeh",
    name: "Bokeh Lights",
    category: "abstract",
    videoUrl: "https://videos.pexels.com/video-files/5926164/5926164-hd_1920_1080_30fps.mp4",
    thumbnailUrl: null,
    sourceId: 5926164,
    fileSizeBytes: 9_725_194,
    tags: ["abstract", "night"],
  }),
  reviewedPreset({
    id: "tropical-coast",
    name: "Tropical Coast",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/2169880/2169880-hd_1280_720_30fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/2169880/free-video-2169880.jpg?auto=compress&cs=tinysrgb&w=280",
    sourceId: 2169880,
    fileSizeBytes: 31_285_838,
    tags: ["coast", "water"],
  }),
  reviewedPreset({
    id: "alpine-valley",
    name: "Alpine Valley",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/3214448/3214448-hd_1280_720_25fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/3214448/free-video-3214448.jpg?auto=compress&cs=tinysrgb&w=280",
    sourceId: 3214448,
    fileSizeBytes: 20_629_263,
    tags: ["mountains", "trail"],
  }),
  reviewedPreset({
    id: "misty-ridge",
    name: "Misty Ridge",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/4763824/4763824-uhd_2560_1440_24fps.mp4",
    thumbnailUrl: null,
    sourceId: 4763824,
    fileSizeBytes: 14_956_479,
    tags: ["mountains", "clouds"],
  }),
  reviewedPreset({
    id: "floating-moss",
    name: "Floating Moss",
    category: "abstract",
    videoUrl: "https://videos.pexels.com/video-files/7710243/7710243-uhd_2560_1440_30fps.mp4",
    thumbnailUrl: null,
    sourceId: 7710243,
    fileSizeBytes: 9_091_671,
    tags: ["abstract", "water"],
  }),
  reviewedPreset({
    id: "forest-waterfall",
    name: "Forest Waterfall",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/11359056/11359056-hd_1920_1080_30fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/11359056/forest-stream-green-river-stream-11359056.jpeg?auto=compress&cs=tinysrgb&w=280",
    sourceId: 11359056,
    fileSizeBytes: 7_802_968,
    tags: ["forest", "water", "waterfall"],
  }),
  reviewedPreset({
    id: "night-drive",
    name: "Dark Road Drive",
    category: "night",
    videoUrl: "https://videos.pexels.com/video-files/34738405/14726108_1440_2560_32fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/34738405/pexels-photo-34738405.jpeg?auto=compress&cs=tinysrgb&w=280",
    sourceId: 34738405,
    fileSizeBytes: 2_263_165,
    tags: ["drive", "night"],
  }),
  reviewedPreset({
    id: "mountain-clouds",
    name: "Clouds over Mountains",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/11640496/11640496-hd_1920_1080_60fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/11640496/cloud-formation-drone-video-11640496.jpeg?auto=compress&cs=tinysrgb&w=280",
    sourceId: 11640496,
    fileSizeBytes: 5_693_396,
    tags: ["clouds", "mountains"],
  }),
  reviewedPreset({
    id: "mountain-forest-trail",
    name: "Mountain Forest Trail",
    category: "nature",
    videoUrl: "https://videos.pexels.com/video-files/6138382/6138382-uhd_2560_1440_25fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/6138382/drone-fog-meeting-sunrise-nature-6138382.jpeg?auto=compress&cs=tinysrgb&w=280",
    sourceId: 6138382,
    fileSizeBytes: 14_925_889,
    tags: ["forest", "mountains", "trail"],
  }),
  reviewedPreset({
    id: "starry-night",
    name: "Starry Night",
    category: "night",
    videoUrl: "https://videos.pexels.com/video-files/35150246/14890799_1440_2560_30fps.mp4",
    thumbnailUrl: "https://images.pexels.com/videos/35150246/pexels-photo-35150246.jpeg?auto=compress&cs=tinysrgb&w=280",
    sourceId: 35150246,
    fileSizeBytes: 3_334_495,
    tags: ["night", "stars"],
  }),
];

export const VIDEO_CATEGORIES: readonly VideoCategory[] = ["nature", "islamic", "night", "abstract"];
