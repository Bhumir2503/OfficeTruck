"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

/**
 * While `when` is on, asks before leaving the page: clicking a link opens a
 * dialog to discard the changes or stay, and reloading or closing the tab
 * gets the browser's own prompt.
 */
export function LeaveGuard({
  when,
  title = "Discard changes?",
  description = "What you've entered hasn't been saved. If you leave this page, it will be lost.",
}: {
  when: boolean
  title?: string
  description?: string
}) {
  const router = useRouter()
  // Where the link was going, while the dialog asks.
  const [href, setHref] = useState<string | null>(null)
  // Set once the user chooses to discard, so the navigation goes through.
  const leaving = useRef(false)

  useEffect(() => {
    if (!when) {
      return
    }

    // Capture runs before Next's Link handler, so the click can be stopped
    // before it navigates.
    function onClick(event: MouseEvent) {
      if (
        leaving.current ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return
      }
      const anchor =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null
      if (
        !anchor ||
        (anchor.target && anchor.target !== "_self") ||
        anchor.hasAttribute("download")
      ) {
        return
      }
      const url = new URL(anchor.href, window.location.href)
      if (
        url.origin !== window.location.origin ||
        (url.pathname === window.location.pathname &&
          url.search === window.location.search)
      ) {
        // Another site gets the browser's prompt; a link on this page (like
        // a section jump) doesn't leave it.
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setHref(url.pathname + url.search + url.hash)
    }

    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!leaving.current) {
        event.preventDefault()
      }
    }

    document.addEventListener("click", onClick, true)
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => {
      document.removeEventListener("click", onClick, true)
      window.removeEventListener("beforeunload", onBeforeUnload)
    }
  }, [when])

  function discard() {
    if (!href) {
      return
    }
    leaving.current = true
    setHref(null)
    router.push(href)
  }

  return (
    <Dialog
      open={href !== null}
      onOpenChange={(open) => !open && setHref(null)}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setHref(null)}>
            Keep editing
          </Button>
          <Button variant="destructive" onClick={discard}>
            Discard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
