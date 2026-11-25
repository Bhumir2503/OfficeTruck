import { ExternalLink } from "lucide-react"

import { saferUrl } from "@/lib/broker-format"

/**
 * FMCSA couldn't be reached: say so, and link to FMCSA's own company
 * snapshot for this MC number to check it by hand.
 */
export function FmcsaDown({
  mc,
  savedOn,
}: {
  /** Digits only. */
  mc: string
  /** When the copy shown was saved, if there is one. */
  savedOn?: string | null
}) {
  return (
    <p
      role="status"
      className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
    >
      FMCSA&apos;s servers are down right now
      {savedOn ? `, so this is the copy saved ${savedOn}` : ""}. Check MC {mc}{" "}
      yourself on{" "}
      <a
        href={saferUrl(mc)}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
      >
        the FMCSA website
        <ExternalLink className="size-3.5" />
      </a>
      .
    </p>
  )
}
