"use client";

import { cn } from "@/lib/utils";

interface BrandMarkProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
  inverted?: boolean;
}

const sizes = {
  sm: "size-8 rounded-lg",
  md: "size-10 rounded-xl",
  lg: "size-14 rounded-[18px]",
};

export function BrandMark({ size = "md", inverted = false, className, ...props }: BrandMarkProps) {
  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center",
        inverted ? "bg-white text-ink-950" : "bg-ink-950 text-white",
        sizes[size],
        className,
      )}
      aria-hidden
      {...props}
    >
      <svg viewBox="0 0 32 32" className="size-[62%]" fill="none">
        <path d="M7 25V12l9-6 9 6v13" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M11 25V14h10v11M14 14v11M18 14v11" stroke="var(--color-lime)" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M5 26.5h22" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
