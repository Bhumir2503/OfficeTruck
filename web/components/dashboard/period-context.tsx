"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

import type { OverviewPeriod } from "@/lib/report-format"

const PeriodContext = createContext<{
  period: OverviewPeriod
  setPeriod: (period: OverviewPeriod) => void
} | null>(null)

/**
 * The dashboard's one period, 30 days, 3 months or a year: the tabs at the
 * top set it, and the charts and the Reports card both follow it.
 */
export function PeriodProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<OverviewPeriod>("1year")
  return (
    <PeriodContext.Provider value={{ period, setPeriod }}>
      {children}
    </PeriodContext.Provider>
  )
}

export function usePeriod() {
  const value = useContext(PeriodContext)
  if (!value) throw new Error("usePeriod needs a PeriodProvider above it")
  return value
}
