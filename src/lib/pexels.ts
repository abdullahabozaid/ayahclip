export interface PexelsPhoto {
  id: number;
  photographer: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    tiny: string;
  };
}

export interface PexelsPhotoResponse {
  photos: PexelsPhoto[];
  total_results: number;
  page: number;
}

export async function searchPhotos(
  query: string,
  page: number = 1
): Promise<PexelsPhotoResponse> {
  const res = await fetch(
    `/api/pexels?query=${encodeURIComponent(query)}&page=${page}&type=photos`
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "Failed to search photos");
  }
  return res.json();
}
