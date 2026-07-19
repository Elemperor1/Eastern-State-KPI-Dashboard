"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  buttonClassName,
  type ButtonSize,
  type ButtonVariant,
} from "./Button";

export interface LinkButtonProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
}

/** Renders the link button interface. */
export function LinkButton({
  children,
  variant = "secondary",
  size = "md",
  icon: Icon,
  iconPosition = "left",
  fullWidth,
  className,
  ...props
}: LinkButtonProps) {
  const hasLeftIcon = Boolean(Icon && iconPosition === "left");
  const hasRightIcon = Boolean(Icon && iconPosition === "right");

  return (
    <Link
      className={buttonClassName({
        variant,
        size,
        hasLeftIcon,
        hasRightIcon,
        fullWidth,
        className,
      })}
      {...props}
    >
      {Icon && iconPosition === "left" ? (
        <Icon className="size-4 shrink-0" aria-hidden />
      ) : null}
      <span>{children}</span>
      {Icon && iconPosition === "right" ? (
        <Icon className="size-4 shrink-0" aria-hidden />
      ) : null}
    </Link>
  );
}
