"use client";

import { cn } from "@/lib/utils";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  initials: string;
  size?: "sm" | "md" | "lg";
  variant?: "brand" | "neutral";
}

const sizes = {
  sm: "size-8 text-xs rounded-lg",
  md: "size-10 text-sm rounded-xl",
  lg: "size-14 text-xl rounded-[18px]",
};

const variants = {
  brand: "bg-ink-950 text-white",
  neutral: "bg-brand-50 text-brand-800",
};

/** Renders the avatar interface. */
export function Avatar({ initials, size = "md", variant = "neutral", className, ...props }: AvatarProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center font-semibold tabular",
        sizes[size],
        variants[variant],
        className,
      )}
      aria-hidden
      {...props}
    >
      {initials}
    </div>
  );
}
