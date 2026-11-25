"use client"

import { UserRoundCheck, UserRoundX } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { setDriverStatus } from "@/app/org/[slug]/drivers/actions"
import { Button } from "@/components/ui/button"
import type { DriverStatus } from "@/lib/schemas/driver"

/** Marks an active driver inactive, or brings an inactive one back. */
export function DriverStatusButton({
  organizationId,
  driver,
}: {
  organizationId: string
  driver: { id: string; full_name: string; status: DriverStatus }
}) {
  const [pending, setPending] = useState(false)
  const next: DriverStatus = driver.status === "active" ? "inactive" : "active"

  async function change() {
    setPending(true)
    const result = await setDriverStatus(organizationId, driver.id, next)
    setPending(false)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(`${driver.full_name} marked ${next}.`)
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={change}
      className="w-fit"
    >
      {next === "inactive" ? <UserRoundX /> : <UserRoundCheck />}
      {pending
        ? "Saving…"
        : next === "inactive"
          ? "Mark inactive"
          : "Mark active"}
    </Button>
  )
}
