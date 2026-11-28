"use client"

import { Search } from "lucide-react"
import { cn } from "cn"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** One choice in a table's filter dropdown, with how many rows it shows. */
export type FilterOption<T extends string> = {
  value: T
  name: string
  count: number
}

/**
 * The search box and filter dropdown above a list table: a full-width search
 * and, beside it, a dropdown whose choices show how many rows each one keeps.
 */
export function TableFilters<T extends string>({
  search,
  onSearchChange,
  searchPlaceholder,
  searchLabel,
  filter,
  onFilterChange,
  options,
  filterLabel = "Filter by status",
  filterClassName = "sm:w-44",
  disabled = false,
}: {
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder: string
  /** Read out for the search box, e.g. "Search drivers". */
  searchLabel: string
  filter: T
  onFilterChange: (value: T) => void
  options: FilterOption<T>[]
  filterLabel?: string
  /** The dropdown's width from the sm breakpoint up; full width on phones. */
  filterClassName?: string
  disabled?: boolean
}) {
  // What the closed dropdown shows: "Active (4)".
  const items = options.map((option) => ({
    ...option,
    label: `${option.name} (${option.count})`,
  }))

  return (
    <div className="flex flex-col gap-3 px-6 pb-4 sm:flex-row sm:items-center">
      <div className="relative w-full">
        <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          className="pl-7"
          value={search}
          disabled={disabled}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
      <Select
        value={filter}
        onValueChange={(value) => {
          if (value !== null) onFilterChange(value as T)
        }}
        items={items}
        disabled={disabled}
      >
        <SelectTrigger
          aria-label={filterLabel}
          className={cn("w-full shrink-0", filterClassName)}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.name}
              <span className="ml-auto pr-2 text-muted-foreground tabular-nums">
                {option.count}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
