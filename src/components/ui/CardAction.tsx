"use client";

import { cn } from "@/lib/utils";

export interface CardActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  as?: "button" | "a";
  href?: string;
  selected?: boolean;
}

export function CardAction({
  children,
  className,
  selected,
  as = "button",
  href,
  ...props
}: CardActionProps) {
  const classes = cn(
    "surface group w-full p-5 text-left active:scale-[0.96] transition-[scale,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:[box-shadow:var(--shadow-surface-hover)] focus:outline-none",
    selected && "ring-2 ring-brand-500/45",
    className,
  );
  if (as === "a" && href) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
