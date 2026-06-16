"use client";

import { useParams } from "next/navigation";
import { CustomReportScreen } from "@/components/reports/custom-report-screen";

export default function CustomReportPage() {
  const params = useParams();
  const templateId = params.id;

  return <CustomReportScreen templateId={templateId} />;
}
