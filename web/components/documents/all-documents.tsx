"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import {
  SettingsCard,
  SettingsCardFooter,
} from "@/components/settings/settings-card"
import { TableFilters, type FilterOption } from "@/components/table-filters"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
  // The type filter's choices, each with how many files it shows.
  const filterOptions = useMemo<FilterOption<DocumentGroup | "all">[]>(
    () => [
      { value: "all", name: "All", count: entries.length },
      ...DOCUMENT_GROUPS.map((key) => ({
        value: key,
        name: DOCUMENT_GROUP_LABELS[key],
        count: entries.filter((entry) => entry.group === key).length,
      })),
    ],
    [entries]
  )

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
      <TableFilters
        search={query}
        onSearchChange={setQuery}
        searchPlaceholder="Search load, driver or type, e.g. POD TQL-1042"
        searchLabel="Search documents"
        filter={group}
        onFilterChange={setGroup}
        options={filterOptions}
        filterLabel="Filter by type"
      />
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
