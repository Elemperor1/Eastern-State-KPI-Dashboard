"use client";

import { useRouter } from "next/navigation";
import { FormField, Select } from "@/components/ui";

export function ReportingYearFilter({
  path,
  year,
  years,
}: {
  path: string;
  year: number;
  years: number[];
}) {
  const router = useRouter();

  return (
    <FormField label="Reporting year" htmlFor="reporting-year" className="w-full sm:w-44">
      <Select
        id="reporting-year"
        value={year}
        onChange={(event) =>
          router.replace(`${path}?year=${event.target.value}`)
        }
      >
        {years.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </Select>
    </FormField>
  );
}
