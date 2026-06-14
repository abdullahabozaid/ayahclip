export type CutoutStyle = "dynamic-island" | "notch" | "punch-hole" | "home-button";

export interface DeviceSpec {
  id: string;
  name: string;
  brand: "apple" | "samsung" | "google";
  screenW: number;
  screenH: number;
  cutout: CutoutStyle;
}

export const DEVICES: DeviceSpec[] = [
  { id: "ip16pm", name: "iPhone 16 Pro Max", brand: "apple", screenW: 440, screenH: 956, cutout: "dynamic-island" },
  { id: "ip16p", name: "iPhone 16 Pro", brand: "apple", screenW: 402, screenH: 874, cutout: "dynamic-island" },
  { id: "ip16+", name: "iPhone 16 Plus", brand: "apple", screenW: 430, screenH: 932, cutout: "dynamic-island" },
  { id: "ip16", name: "iPhone 16", brand: "apple", screenW: 393, screenH: 852, cutout: "dynamic-island" },
  { id: "ip15pm", name: "iPhone 15 Pro Max", brand: "apple", screenW: 430, screenH: 932, cutout: "dynamic-island" },
  { id: "ip15p", name: "iPhone 15 Pro", brand: "apple", screenW: 393, screenH: 852, cutout: "dynamic-island" },
  { id: "ip15", name: "iPhone 15", brand: "apple", screenW: 393, screenH: 852, cutout: "dynamic-island" },
  { id: "ip14pm", name: "iPhone 14 Pro Max", brand: "apple", screenW: 430, screenH: 932, cutout: "dynamic-island" },
  { id: "ip14p", name: "iPhone 14 Pro", brand: "apple", screenW: 393, screenH: 852, cutout: "dynamic-island" },
  { id: "ip14", name: "iPhone 14", brand: "apple", screenW: 390, screenH: 844, cutout: "notch" },
  { id: "ip13", name: "iPhone 13", brand: "apple", screenW: 390, screenH: 844, cutout: "notch" },
  { id: "ip12", name: "iPhone 12", brand: "apple", screenW: 390, screenH: 844, cutout: "notch" },
  { id: "ip11", name: "iPhone 11", brand: "apple", screenW: 414, screenH: 896, cutout: "notch" },
  { id: "ipse", name: "iPhone SE", brand: "apple", screenW: 375, screenH: 667, cutout: "home-button" },
  { id: "gs25u", name: "Galaxy S25 Ultra", brand: "samsung", screenW: 412, screenH: 915, cutout: "punch-hole" },
  { id: "gs25+", name: "Galaxy S25+", brand: "samsung", screenW: 412, screenH: 914, cutout: "punch-hole" },
  { id: "gs25", name: "Galaxy S25", brand: "samsung", screenW: 412, screenH: 892, cutout: "punch-hole" },
  { id: "gs24u", name: "Galaxy S24 Ultra", brand: "samsung", screenW: 412, screenH: 915, cutout: "punch-hole" },
  { id: "px9pxl", name: "Pixel 9 Pro XL", brand: "google", screenW: 412, screenH: 932, cutout: "punch-hole" },
  { id: "px9p", name: "Pixel 9 Pro", brand: "google", screenW: 412, screenH: 892, cutout: "punch-hole" },
  { id: "px9", name: "Pixel 9", brand: "google", screenW: 412, screenH: 842, cutout: "punch-hole" },
];

export const DEFAULT_DEVICE = DEVICES[0];
