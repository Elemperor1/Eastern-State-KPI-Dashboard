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
    "surface p-5 lg:p-6 text-left w-full transition-[box-shadow,transform] duration-150 ease-out hover:shadow-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 active:scale-[0.96] group",
    selected && "ring-2 ring-brand-500/40",
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
