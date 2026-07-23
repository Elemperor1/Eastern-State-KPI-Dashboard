"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbProps {
  href: string;
  label: string;
  className?: string;
}

/** Renders the breadcrumb interface. */
export function Breadcrumb({ href, label, className }: BreadcrumbProps) {
  return (
    <div className={cn("mb-4 no-print", className)}>
      <Link
        href={href}
        className="inline-flex min-h-10 items-center gap-2 rounded-lg pr-3 text-sm font-medium text-ink-600 transition-[color,background-color] duration-(--motion-fast) ease-out hover:text-ink-950 focus:outline-hidden"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {label}
      </Link>
    </div>
  );
}
