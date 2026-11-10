import { CheckIcon } from "lucide-react"

import { cn } from "@/lib/utils"

type Stage = {
  label: string
  detail: string
  state: "done" | "current" | "upcoming"
}

const stages: Stage[] = [
  {
    label: "Rate confirmation approved",
    detail: "Read from the broker's PDF, checked by you",
    state: "done",
  },
  {
    label: "Driver and truck assigned",
    detail: "Sent to the driver's phone",
    state: "done",
  },
  {
    label: "BOL and POD captured",
    detail: "Photographed at the dock, signature found",
    state: "done",
  },
  {
    label: "Invoice packet ready",
    detail: "Waiting for your review before it goes out",
    state: "current",
  },
  { label: "Payment received", detail: "Net 30", state: "upcoming" },
]

const money = [
  { label: "Rate", value: "$1,400" },
  { label: "Costs", value: "$905" },
  { label: "Profit", value: "$495" },
]

/** Illustrative load record. Every figure on it is sample data. */
export function LoadSheet() {
  return (
    <div className="rounded-2xl bg-card p-5 text-card-foreground shadow-2xl ring-1 shadow-black/30 ring-black/5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-sm font-medium">Load #2041</p>
        <p className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          Example load
        </p>
      </div>

      <div className="mt-4 flex items-end justify-between gap-4 border-b pb-4">
        <p className="text-xl font-semibold tracking-tight sm:text-2xl">
          Memphis, TN <span className="text-muted-foreground">to</span> Dallas,
          TX
        </p>
        <p className="shrink-0 font-mono text-sm text-muted-foreground">
          452 mi
        </p>
      </div>

      <ol className="mt-4">
        {stages.map((stage) => (
          <li
            key={stage.label}
            className="group relative flex gap-3 pb-4 last:pb-0"
          >
            <span
              aria-hidden
              className="absolute top-6 bottom-0 left-[11px] w-px bg-border group-last:hidden"
            />
            <span
              aria-hidden
              className={cn(
                "relative mt-0.5 flex size-[23px] shrink-0 items-center justify-center rounded-full",
                stage.state === "done" && "bg-primary text-primary-foreground",
                stage.state === "current" && "bg-[#f4b740] text-neutral-950",
                stage.state === "upcoming" && "border bg-card"
              )}
            >
              {stage.state === "done" && (
                <CheckIcon className="size-3.5" strokeWidth={3} />
              )}
              {stage.state === "current" && (
                <span className="size-2 rounded-full bg-neutral-950" />
              )}
            </span>
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-medium",
                  stage.state === "upcoming" && "text-muted-foreground"
                )}
              >
                {stage.label}
              </p>
              <p className="text-sm text-muted-foreground">{stage.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <dl className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border">
        {money.map((item) => (
          <div key={item.label} className="bg-card p-3">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="mt-0.5 font-mono text-base font-medium sm:text-lg">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
