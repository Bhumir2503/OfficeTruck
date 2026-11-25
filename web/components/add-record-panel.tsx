"use client"

import { cn } from "cn"
import { Check, CornerDownLeft } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { Button, buttonVariants } from "@/components/ui/button"

export type PanelSection = {
  /** The id of the card on the left, which the line jumps to. */
  id: string
  label: string
  /** Shown as "Optional" rather than "Not started" while empty. */
  optional?: boolean
}

type Progress = { filled: number; total: number }

/** How many of the named fields inside `section` have something in them. */
function progressOf(section: HTMLElement): Progress {
  const groups = new Map<string, boolean>()
  for (const element of section.querySelectorAll<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >("input[name], select[name], textarea[name], [data-panel-field]")) {
    if (element instanceof HTMLInputElement && element.type === "file") {
      continue
    }
    const filled =
      element instanceof HTMLInputElement &&
      (element.type === "checkbox" || element.type === "radio")
        ? element.checked
        : element.value.trim() !== ""
    // A field saved apart from the form has no name; it says what to call it.
    const key = element.name || element.dataset.panelField || ""
    groups.set(key, (groups.get(key) ?? false) || filled)
  }
  return {
    filled: [...groups.values()].filter(Boolean).length,
    total: groups.size,
  }
}

/**
 * The panel beside an Add form, like New load's: what's being added (named
 * as soon as it's typed), how far each section on the left is filled in,
 * and saving. It reads its own form, so the form needs nothing extra.
 */
export function AddRecordPanel({
  eyebrow,
  placeholderTitle,
  nameField,
  sections,
  hint,
  submitLabel,
  pending,
  cancelHref,
  formError,
}: {
  /** "New truck" */
  eyebrow: string
  /** The title until a name is typed: "Add a truck". */
  placeholderTitle: string
  /** The field whose value becomes the title: "unit_number". */
  nameField: string
  sections: PanelSection[]
  /** What saving needs: "Only the unit number is needed to save." */
  hint: string
  submitLabel: string
  pending: boolean
  cancelHref: string
  formError?: string | null
}) {
  const panelRef = useRef<HTMLElement>(null)
  const [name, setName] = useState("")
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  // The sections arrive as a new array each render; key the effect on ids.
  const ids = sections.map((section) => section.id).join(" ")

  useEffect(() => {
    const form = panelRef.current?.closest("form")
    if (!form) return
    const read = () => {
      const named = form.elements.namedItem(nameField)
      setName(named instanceof HTMLInputElement ? named.value.trim() : "")
      const next: Record<string, Progress> = {}
      for (const id of ids.split(" ")) {
        const element = form.querySelector<HTMLElement>(`#${id}`)
        if (element) next[id] = progressOf(element)
      }
      // Only re-render when a count actually changed.
      setProgress((current) =>
        JSON.stringify(current) === JSON.stringify(next) ? current : next
      )
    }
    read()
    form.addEventListener("input", read)
    form.addEventListener("change", read)
    // Date pickers and dropdowns write to hidden inputs without firing
    // events; their value attribute changes, so watch for that.
    const observer = new MutationObserver(read)
    observer.observe(form, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["value", "checked"],
    })
    return () => {
      form.removeEventListener("input", read)
      form.removeEventListener("change", read)
      observer.disconnect()
    }
  }, [nameField, ids])

  return (
    <section
      ref={panelRef}
      className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs"
    >
      <div className="px-5 pt-4 pb-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {eyebrow}
        </p>
        <h4
          className={cn(
            "mt-1 truncate text-xl font-semibold tracking-tight",
            !name && "text-muted-foreground"
          )}
        >
          {name || placeholderTitle}
        </h4>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>

        <ol className="mt-4 flex flex-col border-t pt-3">
          {sections.map((section) => {
            const state = progress[section.id]
            const done =
              !!state && state.total > 0 && state.filled === state.total
            const started = !!state && state.filled > 0
            return (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border",
                      done && "border-brand bg-brand text-white",
                      started && !done && "border-brand"
                    )}
                    aria-hidden
                  >
                    {done ? (
                      <Check className="size-3" />
                    ) : (
                      started && (
                        <span className="size-2 rounded-full bg-brand" />
                      )
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {section.label}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {done
                      ? "Done"
                      : started
                        ? `${state.filled} of ${state.total}`
                        : section.optional
                          ? "Optional"
                          : "Not started"}
                  </span>
                </a>
              </li>
            )
          })}
        </ol>

        <div className="mt-4 flex flex-col gap-2 border-t pt-4">
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "Saving…" : submitLabel} <CornerDownLeft />
          </Button>
          <Link
            href={cancelHref}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Cancel
          </Link>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}

/** The panel while its page loads: the same text, nothing filled in yet. */
export function AddRecordPanelSkeleton({
  eyebrow,
  placeholderTitle,
  hint,
  sections,
}: {
  eyebrow: string
  placeholderTitle: string
  hint: string
  sections: Omit<PanelSection, "id">[]
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
      <div className="px-5 pt-4 pb-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {eyebrow}
        </p>
        <h4 className="mt-1 truncate text-xl font-semibold tracking-tight text-muted-foreground">
          {placeholderTitle}
        </h4>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
        <ol className="mt-4 flex flex-col border-t pt-3">
          {sections.map((section) => (
            <li
              key={section.label}
              className="-mx-2 flex items-center gap-3 px-2 py-1.5 text-sm"
            >
              <span className="size-5 shrink-0 rounded-full border" />
              <span className="min-w-0 flex-1 truncate">{section.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {section.optional ? "Optional" : "Not started"}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex flex-col gap-2 border-t pt-4">
          <div className="h-10 w-full animate-pulse rounded-md bg-foreground/10" />
          <div className="mx-auto h-8 w-16 animate-pulse rounded-md bg-muted" />
        </div>
      </div>
    </section>
  )
}
