"use client"

import { Search } from "lucide-react"
import Link from "next/link"
import { useMemo, useState } from "react"

import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  DOCUMENT_GROUP_LABELS,
  DOCUMENT_GROUPS,
  filterDocuments,
  type DocumentEntry,
  type DocumentGroup,
} from "@/lib/company-document-format"

const TABLE =
  "[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6"
const PAGE = 50

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

/** Every file in the organization, searchable by type, name or owner. */
export function AllDocuments({
  entries,
  base,
}: {
  entries: DocumentEntry[]
  /** /org/<slug> */
  base: string
}) {
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState<DocumentGroup | "all">("all")
  const [showAll, setShowAll] = useState(false)
  const filtered = useMemo(
    () => filterDocuments(entries, group, query),
    [entries, group, query]
  )
  const shown = showAll ? filtered : filtered.slice(0, PAGE)
  const counts = useMemo(() => {
    const result: Record<string, number> = { all: entries.length }
    for (const key of DOCUMENT_GROUPS) {
      result[key] = entries.filter((entry) => entry.group === key).length
    }
    return result
  }, [entries])

  return (
    <SettingsCard
      title="All documents"
      contentClassName="@container px-0 pb-0"
      footer={
        filtered.length > PAGE && (
          <SettingsCardFooter
            hint={
              showAll
                ? `Showing all ${filtered.length}.`
                : `Showing ${PAGE} of ${filtered.length}.`
            }
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? "Show fewer" : "Show all"}
            </Button>
          </SettingsCardFooter>
        )
      }
    >
      <div className="flex flex-col gap-3 px-6 pb-4 sm:flex-row sm:items-center">
        <div className="relative w-full">
          <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search load, driver or type, e.g. POD TQL-1042"
            aria-label="Search documents"
            className="pl-7"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <ToggleGroup
          aria-label="Filter documents"
          variant="outline"
          size="sm"
          spacing={1}
          className="shrink-0 flex-wrap"
          value={[group]}
          onValueChange={(value: string[]) =>
            setGroup((value[0] as DocumentGroup | undefined) ?? "all")
          }
        >
          <ToggleGroupItem value="all">
            All
            <span className="text-muted-foreground tabular-nums">
              {counts.all}
            </span>
          </ToggleGroupItem>
          {DOCUMENT_GROUPS.map((key) => (
            <ToggleGroupItem key={key} value={key}>
              {DOCUMENT_GROUP_LABELS[key]}
              <span className="text-muted-foreground tabular-nums">
                {counts[key]}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <Table className={TABLE}>
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="w-full">Document</TableHead>
            <TableHead className="hidden @lg:table-cell">For</TableHead>
            <TableHead className="hidden w-px @2xl:table-cell">Added</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={3}
                className="h-24 text-center text-muted-foreground"
              >
                {entries.length === 0
                  ? "No documents yet. Rate cons, BOLs, PODs, receipts, driver and truck papers show up here."
                  : "No documents match."}
              </TableCell>
            </TableRow>
          )}
          {shown.map((entry) => (
            <TableRow key={entry.key}>
              <TableCell className="max-w-0">
                {entry.url ? (
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium hover:underline"
                  >
                    {entry.type}
                  </a>
                ) : (
                  <span className="font-medium">{entry.type}</span>
                )}
                <p className="truncate text-xs text-muted-foreground">
                  {entry.file_name}
                </p>
              </TableCell>
              <TableCell className="hidden whitespace-nowrap @lg:table-cell">
                {entry.path ? (
                  <Link
                    href={`${base}/${entry.path}`}
                    className="hover:underline"
                  >
                    {entry.owner}
                  </Link>
                ) : (
                  entry.owner
                )}
              </TableCell>
              <TableCell className="hidden whitespace-nowrap text-muted-foreground @2xl:table-cell">
                {dateFormat.format(
                  new Date(`${entry.date.slice(0, 10)}T00:00:00Z`)
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </SettingsCard>
  )
}
