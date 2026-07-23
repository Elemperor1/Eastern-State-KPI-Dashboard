import { Skeleton } from "@/components/ui";

/** Renders the data entry loading interface. */
export default function DataEntryLoading() {
  return (
    <div className="page-content page-content-wide" aria-label="Loading data entry">
      <Skeleton className="mb-8 h-12 w-52" />
      <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Skeleton className="h-152 w-full" />
        <Skeleton className="h-152 w-full" />
      </div>
    </div>
  );
}
