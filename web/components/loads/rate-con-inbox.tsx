"use client"

import { cn } from "cn"
import {
  Check,
  Copy,
  FileText,
  Inbox,
  Loader2,
  PackagePlus,
  RotateCcw,
  X,
} from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  dismissInboxItem,
  readInboxItemAgain,
  restoreInboxItem,
} from "@/app/org/[slug]/loads/inbox-actions"
import { LocalTime } from "@/components/loads/local-time"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsEmptyState,
} from "@/components/settings/settings-card"
import { Button, buttonVariants } from "@/components/ui/button"
import { formatRate } from "@/lib/load-format"
import type { InboxItem } from "@/lib/rate-con-inbox-data"
import { cityState } from "@/lib/report-format"

/** Stuck reading this long, it can be read again. */
const STUCK_MS = 5 * 60_000

/** What the rate con says, in a line: broker, route, rate. */
function summary(item: InboxItem) {
  const read = item.extraction
  if (!read) return null
  const first = read.stops.find((stop) => stop.kind === "pickup")
  const last = read.stops.findLast((stop) => stop.kind === "delivery")
  const route =
    first?.address && last?.address
      ? `${cityState(first.address)} → ${cityState(last.address)}`
      : null
  const total = read.charges.reduce(
    (sum, charge) => sum + (charge.amount ?? 0),
    0
  )
  return [read.broker_name, route, total > 0 ? formatRate(total) : null]
    .filter(Boolean)
    .join(" · ")
}

/** The forwarding address, with a copy button, or how to set it up. */
function AddressCard({
  address,
  domainSet,
}: {
  address: string | null
  domainSet: boolean
}) {
  const [copied, setCopied] = useState(false)
  return (
    <SettingsCard
      title="Forward rate cons here"
      description="Ask brokers to send rate cons to this address, or forward them yourself. Each PDF or photo shows up below, already read, ready to become a load."
      footer={
        <SettingsCardFooter hint="Rate cons sent from your own team's addresses are checked against the broker's email in the forwarded message." />
      }
    >
      {address ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md border bg-muted/40 px-3 py-1.5 text-sm break-all">
            {address}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(address)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              } catch {
                toast.error("It couldn't be copied.")
              }
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {domainSet
            ? "This company has no inbox address yet."
            : "Receiving email isn't set up yet. Set RATE_CON_INBOX_DOMAIN to the domain Resend receives email for."}
        </p>
      )}
    </SettingsCard>
  )
}

function ItemActions({
  organizationId,
  item,
  loadsBase,
  now,
}: {
  organizationId: string
  item: InboxItem
  loadsBase: string
  /** When the page was opened, to tell a read that got stuck. */
  now: number
}) {
  const [pending, start] = useTransition()
  const run = (
    action: () => Promise<{ error: string } | { ok: true }>,
    done: string
  ) =>
    start(async () => {
      const result = await action()
      if ("error" in result) toast.error(result.error)
      else toast.success(done)
    })
  const stuck =
    item.status === "reading" &&
    now - new Date(item.received_at).getTime() > STUCK_MS

  if (item.status === "used") {
    return item.load_id ? (
      <Link
        href={`${loadsBase}/${item.load_id}`}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        Open load
      </Link>
    ) : null
  }
  if (item.status === "dismissed") {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          run(
            () => restoreInboxItem(organizationId, item.id),
            "Back in the inbox."
          )
        }
      >
        <RotateCcw />
        Restore
      </Button>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {(item.status === "failed" || stuck) && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () => readInboxItemAgain(organizationId, item.id),
              "Read again."
            )
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          Read again
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        aria-label="Dismiss"
        disabled={pending}
        onClick={() =>
          run(() => dismissInboxItem(organizationId, item.id), "Dismissed.")
        }
      >
        <X />
      </Button>
      <Link
        href={`${loadsBase}/new?inbox=${item.id}`}
        className={buttonVariants({ size: "sm" })}
        aria-disabled={item.status === "reading"}
      >
        <PackagePlus />
        Create load
      </Link>
    </div>
  )
}

const STATUS: Record<
  InboxItem["status"],
  { label: string; className: string }
> = {
  reading: {
    label: "Reading",
    className: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  ready: {
    label: "Ready",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  failed: {
    label: "Couldn't read",
    className: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  },
  used: { label: "Load made", className: "bg-muted text-muted-foreground" },
  dismissed: {
    label: "Dismissed",
    className: "bg-muted text-muted-foreground",
  },
}

/**
 * Rate cons that came in by email, newest first: what each says, who sent
 * it, and Create load, which opens New Load filled in from it.
 */
export function RateConInbox({
  organizationId,
  items,
  address,
  domainSet,
  loadsBase,
}: {
  organizationId: string
  items: InboxItem[]
  address: string | null
  domainSet: boolean
  /** /org/<slug>/loads */
  loadsBase: string
}) {
  const [showDone, setShowDone] = useState(false)
  const [now] = useState(() => Date.now())
  const open = items.filter(
    (item) => !["used", "dismissed"].includes(item.status)
  )
  const done = items.length - open.length
  const shown = showDone ? items : open

  return (
    <div className="flex flex-col gap-6">
      <AddressCard address={address} domainSet={domainSet} />
      <SettingsCard
        title="Rate con inbox"
        description={
          open.length
            ? `${open.length} waiting to become ${open.length === 1 ? "a load" : "loads"}.`
            : "Nothing waiting."
        }
        action={
          done > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDone((s) => !s)}
            >
              {showDone ? "Hide done" : `Show done (${done})`}
            </Button>
          )
        }
        contentClassName={shown.length ? "px-0 pb-0" : undefined}
      >
        {shown.length === 0 ? (
          <SettingsEmptyState icon={Inbox} title="No rate cons waiting">
            Rate cons sent to the address above show up here, read and ready to
            become loads.
          </SettingsEmptyState>
        ) : (
          <ul className="divide-y border-t">
            {shown.map((item) => {
              const line = summary(item)
              const status = STATUS[item.status]
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex min-w-0 gap-3">
                    <FileText className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 space-y-0.5 text-sm">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {item.extraction?.load_number
                            ? `Load ${item.extraction.load_number}`
                            : item.file_name}
                        </span>
                        <span
                          className={cn(
                            "rounded-md px-1.5 py-0.5 text-xs font-medium",
                            status.className
                          )}
                        >
                          {item.status === "reading" && (
                            <Loader2 className="mr-1 inline size-3 animate-spin" />
                          )}
                          {status.label}
                        </span>
                      </p>
                      {line && <p className="break-words">{line}</p>}
                      {item.status === "failed" && item.error && (
                        <p className="text-amber-800 dark:text-amber-200">
                          {item.error} You can still make the load from it by
                          hand.
                        </p>
                      )}
                      <p className="truncate text-muted-foreground">
                        From {item.sender_email ?? item.from_email} ·{" "}
                        <LocalTime value={item.received_at} />
                        {item.subject && ` · ${item.subject}`}
                      </p>
                    </div>
                  </div>
                  <ItemActions
                    organizationId={organizationId}
                    item={item}
                    loadsBase={loadsBase}
                    now={now}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </SettingsCard>
    </div>
  )
}
