"use client";

import { cn } from "@/lib/utils";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  initials: string;
  size?: "sm" | "md" | "lg";
  variant?: "brand" | "neutral";
}

const sizes = {
  sm: "w-8 h-8 text-xs rounded-lg",
  md: "w-9 h-9 text-sm rounded-xl",
  lg: "w-14 h-14 text-xl rounded-2xl",
};

const variants = {
  brand: "bg-brand-700 text-white shadow-sm",
  neutral: "bg-brand-100 text-brand-800",
};

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
