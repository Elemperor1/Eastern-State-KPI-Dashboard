"use client";

import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui";

export function SampleDataBadge({ sample }: { sample?: boolean }) {
  if (!sample) return null;
  return (
    <Badge variant="accent" icon={AlertCircle}>
      Sample data
    </Badge>
  );
}
