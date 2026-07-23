import { Skeleton } from "@/components/ui";

/** Renders the reports loading interface. */
export default function ReportsLoading() {
  return (
    <div className="page-content page-content-wide" aria-label="Loading reports">
      <Skeleton className="mb-8 h-12 w-52" />
      <Skeleton className="mb-6 h-20 w-full" />
      <Skeleton className="h-128 w-full" />
    </div>
  );
}
