"use client";

import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "quiet";
  as?: "div" | "section" | "article";
}

export function Card({
  children,
  className,
  variant = "default",
  as: Component = "div",
  ...props
}: CardProps) {
  return (
    <Component
      className={cn(
        variant === "default" && "surface",
        variant === "elevated" && "surface-elevated",
        variant === "quiet" && "surface-quiet",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
