"use client";

import { useReactToPrint } from "react-to-print";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import type { RefObject } from "react";

interface Props {
  contentRef: RefObject<HTMLElement | null>;
  documentTitle?: string;
}

/** 인쇄 버튼 — react-to-print 훅으로 contentRef 영역을 인쇄. */
export default function PrintButton({ contentRef, documentTitle }: Props) {
  const handlePrint = useReactToPrint({
    contentRef,
    documentTitle,
  });

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handlePrint}
      className="no-print"
      aria-label="인쇄"
    >
      <Printer aria-hidden="true" />
      인쇄
    </Button>
  );
}
