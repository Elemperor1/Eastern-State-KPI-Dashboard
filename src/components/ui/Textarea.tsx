"use client";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

/** Renders the textarea interface. */
export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn("input min-h-24 resize-y py-2.5", className)}
      {...props}
    />
  );
}
