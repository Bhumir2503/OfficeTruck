"use client"

import { Printer } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Opens the browser's print dialog, where it can also be saved as a PDF. */
export function PrintButton() {
  return (
    <Button size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer />
      Print or save as PDF
    </Button>
  )
}
