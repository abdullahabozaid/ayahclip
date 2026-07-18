"use client";

import { useEffect, useRef, useState } from "react";
import {
  deleteBrollAsset,
  getBrollAssetBlob,
  listBrollAssets,
  saveBrollAsset,
  type BrollAsset,
} from "@/lib/broll-library";
import { isImageFile, isSupportedVideoFile, VIDEO_FILE_ACCEPT } from "@/lib/media-file";
import type { Background } from "@/types";

interface BrollLibraryProps {
  value: Background;
  onSelect: (background: Background) => void;
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export function BrollLibrary({ value, onSelect }: BrollLibraryProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<BrollAsset[]>([]);
  const [assetURLs, setAssetURLs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listBrollAssets().then((stored) => {
      if (!cancelled) {
        setAssets(stored);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const missing = assets.filter((asset) => !assetURLs[asset.id]);
    if (missing.length === 0) return;

    Promise.all(
      missing.map(async (asset) => {
        const blob = await getBrollAssetBlob(asset.id);
        return blob ? ([asset.id, URL.createObjectURL(blob)] as const) : null;
      })
    ).then((entries) => {
      if (cancelled) {
        entries.forEach((entry) => entry && URL.revokeObjectURL(entry[1]));
        return;
      }
      setAssetURLs((current) => ({
        ...current,
        ...Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry != null)),
      }));
    });

    return () => {
      cancelled = true;
    };
  }, [assets, assetURLs]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setSaving(true);
    setError(null);
    const accepted: File[] = [];

    for (const file of Array.from(files)) {
      const isVideo = isSupportedVideoFile(file);
      const isImage = isImageFile(file);
      const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if ((!isVideo && !isImage) || file.size > limit) {
        setError("Some files were skipped. Use images under 20 MB or MP4, WebM, MOV, or M4V videos under 50 MB.");
        continue;
      }
      accepted.push(file);
    }

    const saved: BrollAsset[] = [];
    for (const file of accepted) {
      const asset = await saveBrollAsset(file);
      if (asset) saved.push(asset);
    }
    if (saved.length !== accepted.length) {
      setError("Some media could not be stored. Check available browser storage and try again.");
    }
    setAssets(await listBrollAssets());
    setSaving(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = async (id: string) => {
    const removed = await deleteBrollAsset(id);
    if (!removed) {
      setError("That item could not be removed from local storage.");
      return;
    }
    const url = assetURLs[id];
    if (url && value.value !== url) URL.revokeObjectURL(url);
    setAssetURLs((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setAssets((current) => current.filter((asset) => asset.id !== id));
    setPendingDelete(null);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-parchment">Your reusable media</p>
          <p className="mt-0.5 text-[11px] text-[var(--muted-deep)]">Stored only in this browser.</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={`image/*,${VIDEO_FILE_ACCEPT}`}
          multiple
          onChange={(event) => void handleFiles(event.target.files)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={saving}
          className="btn-ghost min-h-10 rounded-full px-3 text-xs disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add media"}
        </button>
      </div>

      {error && <p className="text-xs leading-relaxed text-red-400" role="alert">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-2 gap-2" aria-label="Loading your B-roll library">
          <div className="shimmer aspect-video rounded-lg" />
          <div className="shimmer aspect-video rounded-lg" />
        </div>
      ) : assets.length === 0 ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="min-h-24 w-full rounded-xl border border-dashed border-[var(--hairline)] px-5 text-left hover:border-gold"
        >
          <span className="block text-sm text-parchment">Build your B-roll shelf</span>
          <span className="mt-1 block text-xs leading-relaxed text-[var(--muted)]">
            Add nature, road, sky or abstract clips once, then reuse them in any project.
          </span>
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {assets.map((asset) => {
            const url = assetURLs[asset.id];
            const deleting = pendingDelete === asset.id;
            return (
              <div key={asset.id} className="overflow-hidden rounded-lg border border-[var(--hairline-soft)] bg-[var(--ink-deep)]">
                <button
                  type="button"
                  disabled={!url}
                  onClick={() => url && onSelect({ type: asset.type, value: url, label: asset.name })}
                  className="group relative block aspect-video w-full overflow-hidden bg-[var(--surface)] disabled:opacity-50"
                  aria-label={`Use ${asset.name}`}
                >
                  {url && asset.type === "video" ? (
                    <video src={url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  ) : url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                  ) : null}
                  {value.value === url && (
                    <span className="absolute left-2 top-2 rounded-full bg-gold px-2 py-0.5 text-[9px] font-medium text-[var(--ink-deep)]">
                      In use
                    </span>
                  )}
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-[var(--ink-deep)]/85 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-parchment">
                    {asset.type}
                  </span>
                </button>
                <div className="px-2.5 py-2">
                  <p className="truncate text-[11px] text-parchment" title={asset.name}>{asset.name}</p>
                  {deleting ? (
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={() => void remove(asset.id)} className="text-[11px] text-red-300 hover:text-red-200">
                        Remove
                      </button>
                      <button type="button" onClick={() => setPendingDelete(null)} className="text-[11px] text-[var(--muted)] hover:text-parchment">
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingDelete(asset.id)}
                      className="mt-1 text-[10px] text-[var(--muted-deep)] hover:text-red-300"
                      aria-label={`Remove ${asset.name} from library`}
                    >
                      Remove from shelf
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
