"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAppStore } from "@/lib/store";

export function NewClipLink({
  href = "/browse",
  className,
  children,
  onClick,
}: {
  href?: "/browse" | "/import";
  className?: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  const beginNewProject = useAppStore((state) => state.beginNewProject);
  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        beginNewProject();
        onClick?.();
      }}
    >
      {children}
    </Link>
  );
}
