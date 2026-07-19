"use client";

import { useRouter } from "next/navigation";
import { FormField, Select } from "@/components/ui";

/** Renders the overview year filter interface. */
export function OverviewYearFilter({
  year,
  years,
}: {
  year: number;
  years: number[];
}) {
  const router = useRouter();
  return (
    <FormField label="Reporting year" htmlFor="overview-year" className="w-full sm:w-44">
      <Select
        id="overview-year"
        value={year}
        onChange={(event) =>
          router.replace(`/dashboard/overview?year=${event.target.value}`)
        }
      >
        {years.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    </FormField>
  );
}
