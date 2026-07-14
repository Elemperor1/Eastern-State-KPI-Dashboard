import { Skeleton } from "@/components/ui";

export default function DataEntryLoading() {
  return (
    <div className="page-content page-content-wide" aria-label="Loading data entry">
      <Skeleton className="mb-8 h-12 w-52" />
      <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <Skeleton className="h-[38rem] w-full" />
        <Skeleton className="h-[38rem] w-full" />
      </div>
    </div>
  );
}
