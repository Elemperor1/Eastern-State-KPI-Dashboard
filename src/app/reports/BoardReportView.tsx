"use client";

import { ExportPDFButton } from "@/components/ExportPDFButton";
import { SampleDataBadge } from "@/components/SampleDataBadge";
import { StrategicBoardReport } from "@/components/StrategicBoardReport";
import { ExportCSVButton, ExportPNGButton, PrintButton } from "@/components/ui";
import { buildStrategicBoardCsvExport } from "@/features/reporting/strategic-board-report";
import type { BoardReportPageData } from "@/features/reporting/types";

export function BoardReportView({ data }: { data: BoardReportPageData }) {
  const csv = buildStrategicBoardCsvExport(data.report);
  const targetId = "board-report-root";
  return (
    <>
      <div className="mb-5 flex flex-wrap justify-end gap-2 no-print">
        <SampleDataBadge sample={data.sampleData} />
        <ExportCSVButton rows={csv.rows} columns={[...csv.columns]} filename={csv.filename} />
        <PrintButton />
        <ExportPNGButton targetId={targetId} fileName={`${data.report.organizationSlug}-board-report-${data.report.selectedYear}.png`} />
        <ExportPDFButton targetId={targetId} fileName={`${data.report.organizationSlug}-board-report-${data.report.selectedYear}.pdf`} />
      </div>
      <StrategicBoardReport id={targetId} report={data.report} />
    </>
  );
}
