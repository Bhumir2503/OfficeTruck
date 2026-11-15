"use client"

import { cn } from "cn"
import { Building2, Loader2, MapPin } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

import {
  pickStopAddress,
  suggestStopAddresses,
} from "@/app/org/[slug]/loads/actions"
import { Input } from "@/components/ui/input"
import type { AddressSuggestion, PickedAddress } from "@/lib/places"

const newSession = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Math.random()).slice(2)

/**
 * A stop's address, with Google Maps suggestions as it's typed. Picking one
 * fills in the full address; `onPick` also gets the business's name, for
 * the shipper or receiver box. Anything can still be typed by hand.
 */
export function AddressInput({
  organizationId,
  id,
  name,
  defaultValue,
  placeholder,
  invalid,
  onPick,
  onChanged,
}: {
  organizationId: string
  id: string
  name: string
  defaultValue?: string
  placeholder?: string
  invalid?: boolean
  onPick?: (picked: PickedAddress) => void
  /** The address is different from before: picked, or typed and left. */
  onChanged?: () => void
}) {
  const [value, setValue] = useState(defaultValue ?? "")
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [picking, setPicking] = useState(false)
  // Off for good once Google says it isn't set up, so typing stays quiet.
  const [unavailable, setUnavailable] = useState(false)
  const session = useRef<string | null>(null)
  const requestId = useRef(0)
  const lastSettled = useRef(defaultValue ?? "")
  const listId = useId()

  // Suggestions for what's typed, a moment after typing stops.
  useEffect(() => {
    if (!open || unavailable || value.trim().length < 3) return
    const id = ++requestId.current
    const timer = setTimeout(async () => {
      session.current ??= newSession()
      const result = await suggestStopAddresses(
        organizationId,
        value,
        session.current
      ).catch(() => null)
      if (id !== requestId.current) return
      if (!result) return
      if (!result.ok) {
        setUnavailable(true)
        setSuggestions([])
        return
      }
      setSuggestions(result.value)
      setActive(-1)
    }, 250)
    return () => clearTimeout(timer)
  }, [value, open, unavailable, organizationId])

  function settle(next: string) {
    if (next.trim() !== lastSettled.current.trim()) {
      lastSettled.current = next
      onChanged?.()
    }
  }

  async function pick(suggestion: AddressSuggestion) {
    requestId.current++
    setOpen(false)
    setSuggestions([])
    // Shown straight away, then swapped for the full address with its ZIP.
    const quick = [
      suggestion.business ? null : suggestion.main,
      suggestion.secondary,
    ]
      .filter(Boolean)
      .join(", ")
    setValue(quick)
    setPicking(true)
    const result = await pickStopAddress(
      organizationId,
      suggestion.placeId,
      session.current ?? newSession()
    ).catch(() => null)
    // A new session for the next lookup.
    session.current = null
    setPicking(false)
    const picked: PickedAddress = result?.ok
      ? result.value
      : { address: quick, name: suggestion.business ? suggestion.main : null }
    setValue(picked.address)
    onPick?.(picked)
    settle(picked.address)
  }

  const showList = open && suggestions.length > 0 && value.trim().length >= 3

  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        value={value}
        placeholder={placeholder}
        aria-invalid={invalid}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && active >= 0 ? `${listId}-${active}` : undefined
        }
        className={cn(picking && "pr-8")}
        onChange={(event) => {
          setValue(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          settle(value)
        }}
        onKeyDown={(event) => {
          if (!showList) return
          if (event.key === "ArrowDown") {
            event.preventDefault()
            setActive((index) => (index + 1) % suggestions.length)
          } else if (event.key === "ArrowUp") {
            event.preventDefault()
            setActive((index) =>
              index <= 0 ? suggestions.length - 1 : index - 1
            )
          } else if (event.key === "Enter" && active >= 0) {
            // Picks the suggestion instead of saving the form.
            event.preventDefault()
            void pick(suggestions[active])
          } else if (event.key === "Escape") {
            setOpen(false)
          }
        }}
      />
      {picking && (
        <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {showList && (
        <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md">
          <ul id={listId} role="listbox" className="py-1">
            {suggestions.map((suggestion, index) => {
              const Icon = suggestion.business ? Building2 : MapPin
              return (
                <li
                  key={suggestion.placeId}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 px-3 py-2 text-sm",
                    index === active && "bg-accent text-accent-foreground"
                  )}
                  // Keeps focus in the box, so blur doesn't close the list
                  // before the click lands.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => void pick(suggestion)}
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {suggestion.main}
                    </span>
                    {suggestion.secondary && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {suggestion.secondary}
                      </span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
          <p className="border-t px-3 py-1.5 text-right text-[11px] text-muted-foreground">
            Powered by Google
          </p>
        </div>
      )}
    </div>
  )
}
