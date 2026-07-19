"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { runEventHandler } from "@/lib/async-event";
import { type LucideIcon } from "lucide-react";

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconPosition?: "left" | "right";
  isLoading?: boolean;
  fullWidth?: boolean;
  onClick?: (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => void | Promise<void>;
}

export type ButtonVariant = "primary" | "inverted" | "secondary" | "ghost" | "darkGhost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

/** Implements the button class name operation. */
export function buttonClassName({
  variant,
  size,
  hasLeftIcon,
  hasRightIcon,
  fullWidth,
  className,
}: {
  variant: ButtonVariant;
  size: ButtonSize;
  hasLeftIcon?: boolean;
  hasRightIcon?: boolean;
  fullWidth?: boolean;
  className?: string;
}) {
  return cn(
    "btn",
    variant === "primary" && "btn-primary",
    variant === "inverted" && "btn-inverted",
    variant === "secondary" && "btn-secondary",
    variant === "ghost" && "btn-ghost",
    variant === "darkGhost" && "btn-dark-ghost",
    variant === "danger" && "btn-danger",
    size === "sm" && "min-h-10 px-3 text-xs",
    size === "md" && "min-h-11 px-4 text-sm",
    size === "lg" && "min-h-12 px-5 text-sm",
    hasLeftIcon && "pl-3.5",
    hasRightIcon && "pr-3.5",
    fullWidth && "w-full",
    className,
  );
}

/** Renders the shared application button control. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  children,
  variant = "secondary",
  size = "md",
  icon: Icon,
  iconPosition = "left",
  isLoading,
  fullWidth,
  className,
  disabled,
  onClick,
  ...props
}, ref) {
  const hasLeftIcon = Boolean(isLoading || (Icon && iconPosition === "left"));
  const hasRightIcon = Boolean(!isLoading && Icon && iconPosition === "right");

  return (
    <button
      ref={ref}
      className={buttonClassName({ variant, size, hasLeftIcon, hasRightIcon, fullWidth, className })}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      onClick={onClick ? (event) => runEventHandler(onClick, event) : undefined}
      {...props}
    >
      {isLoading ? (
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : Icon && iconPosition === "left" ? (
        <Icon className="size-4 shrink-0" aria-hidden />
      ) : null}
      {typeof children === "string" || typeof children === "number" ? (
        <span>{children}</span>
      ) : (
        children
      )}
      {!isLoading && Icon && iconPosition === "right" ? (
        <Icon className="size-4 shrink-0" aria-hidden />
      ) : null}
    </button>
  );
});
