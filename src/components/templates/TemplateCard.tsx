"use client";

import { TemplatePreview } from "./TemplatePreview";
import { TemplateIcon } from "./TemplateIcon";
import type { TemplateDefinition } from "@/lib/template-model";

export function TemplateCard({
  template,
  onUse,
  onCustomize,
  onDuplicate,
  onDelete,
}: {
  template: TemplateDefinition;
  onUse: () => void;
  onCustomize: () => void;
  onDuplicate: () => void;
  onDelete?: () => void;
}) {
  return (
    <article className="group overflow-hidden rounded-2xl border border-[var(--hairline-soft)] bg-[var(--surface)] shadow-[0_18px_50px_-36px_rgba(0,0,0,0.9)] transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--hairline)]">
      <button
        type="button"
        onClick={onCustomize}
        className="relative block aspect-[9/16] w-full overflow-hidden bg-[var(--ink-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold"
        aria-label={`Customize ${template.name}`}
      >
        <div className="absolute inset-0 z-0" style={{ background: template.swatch }} />
        <TemplatePreview
          style={template.settings}
          extras={template.extras}
          previewMedia={template.mediaSlots.length > 0}
          renderWidth={270}
          className="relative z-[1] block h-full w-full"
        />
        <span className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.14em] text-white/70 backdrop-blur sm:text-[10px]">
          {template.source === "user" ? "My template" : template.family}
        </span>
      </button>
      <div className="space-y-3 p-3.5">
        <div>
          <h2 className="truncate text-sm font-medium text-parchment">{template.name}</h2>
          <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-[var(--muted)] sm:min-h-8 sm:text-[11px] sm:leading-4">
            {template.description}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onUse}
            className="min-h-10 flex-1 rounded-xl border border-[var(--hairline)] px-3 text-xs font-medium text-parchment transition-colors hover:border-gold focus-visible:border-gold"
          >
            Use template
          </button>
          <IconAction label={`Customize ${template.name}`} onClick={onCustomize} icon="settings" />
          <IconAction label={`Duplicate ${template.name}`} onClick={onDuplicate} icon="copy" />
          {onDelete && <IconAction label={`Delete ${template.name}`} onClick={onDelete} icon="trash" danger />}
        </div>
      </div>
    </article>
  );
}

function IconAction({
  label,
  onClick,
  icon,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  icon: "copy" | "settings" | "trash";
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--hairline-soft)] transition-colors focus-visible:border-gold ${
        danger
          ? "text-[var(--muted)] hover:border-red-400/40 hover:text-red-300"
          : "text-[var(--muted)] hover:border-[var(--hairline)] hover:text-parchment"
      }`}
    >
      <TemplateIcon name={icon} className="h-4 w-4" />
    </button>
  );
}
