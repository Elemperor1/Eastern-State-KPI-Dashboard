"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BreadcrumbProps {
  href: string;
  label: string;
  className?: string;
}

export function Breadcrumb({ href, label, className }: BreadcrumbProps) {
  return (
    <div className={cn("mb-3 no-print", className)}>
      <Link
        href={href}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 rounded-md"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden />
        {label}
      </Link>
    </div>
  );
}
