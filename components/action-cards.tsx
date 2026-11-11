import {
  ArrowRightIcon,
  CircleCheckIcon,
  ClockAlertIcon,
  FileWarningIcon,
  PackageIcon,
  SendIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { ActionCounts } from "@/lib/action-counts"

const ACTIONS: {
  key: keyof ActionCounts
  label: string
  hint: string
  path: string
  icon: LucideIcon
}[] = [
  {
    key: "loadsMissingPod",
    label: "Loads missing a POD",
    hint: "Delivered, but no proof of delivery yet",
    path: "loads",
    icon: PackageIcon,
  },
  {
    key: "invoicesReadyToSend",
    label: "Invoices ready to send",
    hint: "Paperwork is complete and ready to bill",
    path: "invoices",
    icon: SendIcon,
  },
  {
    key: "overduePayments",
    label: "Overdue payments",
    hint: "Brokers past their payment terms",
    path: "invoices",
    icon: ClockAlertIcon,
  },
  {
    key: "documentsExpiringSoon",
    label: "Documents expiring soon",
    hint: "Driver, truck and filing dates in the next 30 days",
    path: "compliance",
    icon: FileWarningIcon,
  },
]

export function ActionCards({
  base,
  counts,
}: {
  base: string
  counts: ActionCounts
}) {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {ACTIONS.map(({ key, label, hint, path, icon: Icon }) => {
        const count = counts[key]
        return (
          <Card key={key} className="@container/card">
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {count}
              </CardTitle>
              <CardAction>
                {count > 0 ? (
                  <Badge variant="destructive">
                    <Icon />
                    Needs action
                  </Badge>
                ) : (
                  <Badge variant="outline">
                    <CircleCheckIcon />
                    All clear
                  </Badge>
                )}
              </CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 text-sm">
              <div className="text-muted-foreground">{hint}</div>
              <Link
                href={`${base}/${path}`}
                className="flex items-center gap-1 font-medium underline-offset-4 hover:underline"
              >
                View
                <ArrowRightIcon className="size-4" />
              </Link>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
