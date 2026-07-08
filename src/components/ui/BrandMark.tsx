"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Eastern State brand mark.
 *
 * Uses the official PNG asset shipped at `public/logos/eastern-state-mark.png`
 * (cropped from the full "Logo - ES - Stacked - Color White Type" master
 * delivered by the Eastern State brand team). We render the raster directly
 * because the mark is a detailed two-bar prison gate with a central locking
 * mechanism — too much detail to hand-trace, and the official raster is the
 * source of truth the brand team provided.
 *
 * Color match: the mark uses `{colors.primary}` (#209ba5) for the teal faces
 * and `{colors.secondary}` (#005f6f) for the navy extrusion faces, both of
 * which match the dashboard palette exactly. The mark renders identically
 * on light and dark surfaces because the teal/navy palette works on both.
 *
 * The `size` prop drives the rendered pixel size for the AppShell and auth
 * surfaces.
 */

interface BrandMarkProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: { px: 32, className: "size-8" },
  md: { px: 40, className: "size-10" },
  lg: { px: 56, className: "size-14" },
} as const;

export function BrandMark({
  size = "md",
  className,
}: BrandMarkProps) {
  const { px, className: sizeClass } = sizeMap[size];
  return (
    <div
      className={cn(
        "relative inline-block shrink-0 overflow-hidden",
        sizeClass,
        className,
      )}
    >
      <Image
        src="/logos/eastern-state-mark.png"
        alt="Eastern State Penitentiary"
        width={px}
        height={px}
        // The cropped mark is 0.943:1 (slightly taller than wide). object-contain
        // preserves that aspect inside the square frame.
        className="h-full w-full object-contain"
        priority
      />
    </div>
  );
}
