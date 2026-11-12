import { cn } from "cn"
import { CircleHelp, ShieldAlert, ShieldCheck } from "lucide-react"

import type { SenderCheck } from "@/lib/broker-format"

/**
 * The impersonation check on a rate con sender: their email domain against
 * the broker's known domains. A mismatch is a common sign of someone posing
 * as a real broker.
 */
export function SenderWarning({
  check,
  email,
  brokerName,
  compact = false,
}: {
  check: SenderCheck
  email?: string
  /** For the full message: "isn't one of TQL's domains". */
  brokerName?: string
  /** A one-line version for tables. */
  compact?: boolean
}) {
  if (check.state === "empty") {
    return null
  }

  if (compact) {
    const tone =
      check.state === "match"
        ? "text-foreground"
        : check.state === "mismatch"
          ? "text-destructive"
          : "text-muted-foreground"
    const Icon =
      check.state === "match"
        ? ShieldCheck
        : check.state === "mismatch"
          ? ShieldAlert
          : CircleHelp
    return (
      <span
        className={cn("inline-flex max-w-56 items-center gap-1", tone)}
        title={
          check.state === "mismatch"
            ? "Not one of the broker's known domains"
            : check.state === "unknown"
              ? "The broker has no known domains to compare with"
              : undefined
        }
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{email}</span>
      </span>
    )
  }

  if (check.state === "invalid") {
    return (
      <p className="text-sm text-muted-foreground">
        Enter the full email address to check the sender.
      </p>
    )
  }

  const whose = brokerName ? `${brokerName}'s` : "the broker's"
  const styles = {
    match: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    mismatch: "bg-destructive/10 text-destructive",
    unknown: "bg-muted text-muted-foreground",
  }[check.state]
  const Icon = {
    match: ShieldCheck,
    mismatch: ShieldAlert,
    unknown: CircleHelp,
  }[check.state]

  return (
    <div
      role={check.state === "mismatch" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg px-3 py-2 text-sm",
        styles
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>
        {check.state === "match" && (
          <>
            <span className="font-medium">{check.domain}</span> is one of{" "}
            {whose} known domains.
          </>
        )}
        {check.state === "mismatch" && (
          <>
            <span className="font-medium">{check.domain}</span> isn&apos;t one
            of {whose} known domains. Someone may be posing as this broker: call
            them on a number you already have before hauling.
          </>
        )}
        {check.state === "unknown" && (
          <>
            {brokerName ?? "This broker"} has no known email domains yet, so{" "}
            <span className="font-medium">{check.domain}</span> can&apos;t be
            checked. Add their domains on the broker page.
          </>
        )}
      </span>
    </div>
  )
}
