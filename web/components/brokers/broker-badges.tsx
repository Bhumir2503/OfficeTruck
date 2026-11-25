import { cn } from "cn"
import {
  AlertTriangle,
  Ban,
  CircleHelp,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react"

import { fmcsaFlags, type FmcsaFlag } from "@/lib/broker-format"
import type { FmcsaRecord } from "@/lib/fmcsa"

const pill =
  "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-4xl px-2.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3"

const TONES = {
  danger: "bg-destructive/10 text-destructive",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  muted: "bg-muted text-muted-foreground",
}

export function FlagBadge({ flag }: { flag: FmcsaFlag }) {
  return (
    <span className={cn(pill, TONES[flag.tone])}>
      {flag.tone === "danger" ? (
        <ShieldAlert aria-hidden />
      ) : (
        <AlertTriangle aria-hidden />
      )}
      {flag.text}
    </span>
  )
}

/**
 * The FMCSA picture in one badge: not checked, clear, or the worst problem
 * (with a count when there's more than one).
 */
export function FmcsaBadge({
  record,
  hasMc,
}: {
  record: FmcsaRecord | null
  hasMc: boolean
}) {
  if (!hasMc) {
    return (
      <span className={cn(pill, TONES.muted)}>
        <CircleHelp aria-hidden />
        No MC number
      </span>
    )
  }
  if (!record) {
    return (
      <span className={cn(pill, TONES.muted)}>
        <CircleHelp aria-hidden />
        Not checked
      </span>
    )
  }
  const flags = fmcsaFlags(record)
  if (flags.length === 0) {
    return (
      <span className={cn(pill, TONES.ok)}>
        <ShieldCheck aria-hidden />
        Clear
      </span>
    )
  }
  const [worst] = flags
  return (
    <span
      className={cn(pill, TONES[worst.tone])}
      title={flags.map((flag) => flag.text).join(" · ")}
    >
      {worst.tone === "danger" ? (
        <ShieldAlert aria-hidden />
      ) : (
        <AlertTriangle aria-hidden />
      )}
      {worst.text}
      {flags.length > 1 && ` +${flags.length - 1}`}
    </span>
  )
}

export function DoNotUseBadge() {
  return (
    <span className={cn(pill, TONES.danger)}>
      <Ban aria-hidden />
      Do not use
    </span>
  )
}
