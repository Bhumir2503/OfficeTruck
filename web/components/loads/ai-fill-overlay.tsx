"use client"

import { Sparkles } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { Button } from "@/components/ui/button"

// What the person sees while AI reads the rate con. The read is one request
// with no real progress, so these just step along to show it's still working.
const STEPS = [
  "Reading the rate con…",
  "Finding the load number and freight…",
  "Matching the broker…",
  "Pulling pickups and deliveries…",
  "Adding up the rate and charges…",
  "Almost done…",
]
const STEP_MS = 2200

/**
 * Covers the whole screen while AI fills in the load, so nothing else can be
 * clicked or typed into until it's done or cancelled. Only Cancel works.
 */
export function AiFillOverlay({ onCancel }: { onCancel: () => void }) {
  const [step, setStep] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const cancel = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const timer = setInterval(
      () => setStep((current) => Math.min(current + 1, STEPS.length - 1)),
      STEP_MS
    )
    return () => clearInterval(timer)
  }, [])

  // The overlay stops clicks; making the rest of the page inert stops the
  // keyboard (Tab, Enter) from reaching it too. The page can't scroll under it.
  useEffect(() => {
    const others = Array.from(document.body.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element !== root.current &&
        !element.inert
    )
    others.forEach((element) => (element.inert = true))
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    cancel.current?.focus()
    return () => {
      others.forEach((element) => (element.inert = false))
      document.body.style.overflow = overflow
    }
  }, [])

  return createPortal(
    <div
      ref={root}
      className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-black/30 p-4 backdrop-blur-sm duration-200 fade-in"
    >
      <div className="flex w-full justify-center">
        <div
          role="status"
          aria-live="polite"
          className="flex w-full max-w-sm animate-in flex-col items-center rounded-2xl border border-violet-200 bg-card px-6 py-7 text-center shadow-lg shadow-violet-500/10 duration-300 zoom-in-95 fade-in"
        >
          {/* A page with a bar sweeping down it. */}
          <div className="relative mb-5 h-20 w-16 overflow-hidden rounded-md border border-violet-200 bg-violet-50/60">
            <div className="flex flex-col gap-1.5 px-2.5 pt-3">
              <span className="h-1 w-8 rounded-full bg-violet-200" />
              <span className="h-1 w-10 rounded-full bg-violet-200" />
              <span className="h-1 w-6 rounded-full bg-violet-200" />
              <span className="h-1 w-9 rounded-full bg-violet-200" />
              <span className="h-1 w-7 rounded-full bg-violet-200" />
              <span className="h-1 w-10 rounded-full bg-violet-200" />
            </div>
            <span className="absolute inset-x-0 h-0.5 animate-ai-scan bg-violet-500 shadow-[0_0_8px_2px] shadow-violet-400/60" />
            <span className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full bg-violet-600 text-white">
              <Sparkles className="size-3.5 animate-pulse" />
            </span>
          </div>
          <p className="text-base font-semibold tracking-tight">
            AI is filling in the load
          </p>
          <p
            key={step}
            className="mt-1 animate-in text-sm text-muted-foreground duration-300 fade-in slide-in-from-bottom-1"
          >
            {STEPS[step]}
          </p>
          <div className="mt-4 flex gap-1">
            {STEPS.map((label, index) => (
              <span
                key={label}
                className={
                  index <= step
                    ? "h-1 w-5 rounded-full bg-violet-500 transition-colors"
                    : "h-1 w-5 rounded-full bg-violet-100 transition-colors"
                }
              />
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            This usually takes 10 to 20 seconds.
          </p>
          <Button
            ref={cancel}
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
