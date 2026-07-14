import { Skeleton } from "@/components/ui";

export default function SetupLoading() {
  return (
    <div className="page-content page-content-wide" aria-label="Loading setup">
      <Skeleton className="mb-6 h-12 w-40" />
      <Skeleton className="mb-8 h-12 w-full" />
      <Skeleton className="h-[36rem] w-full" />
    </div>
  );
}
