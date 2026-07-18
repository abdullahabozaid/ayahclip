import { del, get, set } from "idb-keyval";

const INDEX_KEY = "broll-library:index:v1";
const ASSET_PREFIX = "broll-library:asset:";

export interface BrollAsset {
  id: string;
  name: string;
  type: "image" | "video";
  mimeType: string;
  size: number;
  createdAt: number;
}

function assetKey(id: string): string {
  return `${ASSET_PREFIX}${id}`;
}

function storageWarning(operation: string, error: unknown): void {
  console.warn(`[broll-library] ${operation} failed`, error);
}

export async function listBrollAssets(): Promise<BrollAsset[]> {
  try {
    const assets = await get<BrollAsset[]>(INDEX_KEY);
    return (assets ?? []).sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    storageWarning("list", error);
    return [];
  }
}

export async function saveBrollAsset(file: File): Promise<BrollAsset | null> {
  const type: BrollAsset["type"] = file.type.startsWith("video/") ? "video" : "image";
  const asset: BrollAsset = {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    name: file.name,
    type,
    mimeType: file.type,
    size: file.size,
    createdAt: Date.now(),
  };

  try {
    await set(assetKey(asset.id), file);
    const current = await listBrollAssets();
    await set(INDEX_KEY, [asset, ...current.filter((item) => item.id !== asset.id)]);
    return asset;
  } catch (error) {
    await del(assetKey(asset.id)).catch(() => {});
    storageWarning("save", error);
    return null;
  }
}

export async function getBrollAssetBlob(id: string): Promise<Blob | undefined> {
  try {
    return await get<Blob>(assetKey(id));
  } catch (error) {
    storageWarning("read", error);
    return undefined;
  }
}

export async function deleteBrollAsset(id: string): Promise<boolean> {
  try {
    const current = await listBrollAssets();
    await del(assetKey(id));
    await set(INDEX_KEY, current.filter((asset) => asset.id !== id));
    return true;
  } catch (error) {
    storageWarning("delete", error);
    return false;
  }
}
