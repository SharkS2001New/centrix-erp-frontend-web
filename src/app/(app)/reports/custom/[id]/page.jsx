"use client";

import { useParams } from "next/navigation";
import { CustomReportScreen } from "@/components/reports/custom-report-screen";
import { AiAssistPanel } from "@/components/ai/ai-assist-panel";

export default function CustomReportPage() {
  const params = useParams();
  const templateId = params.id;

  return (
    <>
      <CustomReportScreen templateId={templateId} />
      <AiAssistPanel context="reports" title="Reports assistant" />
    </>
  );
}
