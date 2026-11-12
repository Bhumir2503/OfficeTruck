"use client"

import {
  CrownIcon,
  EllipsisIcon,
  ShieldIcon,
  UserRoundIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  changeMemberRole,
  transferOwnership,
} from "@/app/org/[slug]/settings/members/actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

/**
 * The owner's menu on another member's row: switch them between admin and
 * member, or hand them ownership (which makes the current owner an admin).
 */
export function MemberRoleMenu({
  organizationId,
  organizationName,
  member,
}: {
  organizationId: string
  organizationName: string
  member: { id: string; name: string; role: "admin" | "member" }
}) {
  const [pending, setPending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [transferError, setTransferError] = useState<string | null>(null)

  async function changeRole(role: "admin" | "member") {
    setPending(true)
    const result = await changeMemberRole(organizationId, member.id, role)
    setPending(false)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(
        role === "admin"
          ? `${member.name} is now an admin.`
          : `${member.name} is now a member.`
      )
    }
  }

  async function transfer() {
    setPending(true)
    setTransferError(null)
    const result = await transferOwnership(organizationId, member.id)
    setPending(false)
    if ("error" in result) {
      setTransferError(result.error)
      return
    }
    setConfirmOpen(false)
    toast.success(`${member.name} is now the owner. You're an admin.`)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={pending}
              aria-label={`Change ${member.name}'s role`}
            />
          }
        >
          <EllipsisIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="truncate">
              {member.name}
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          {member.role === "member" ? (
            <DropdownMenuItem onClick={() => changeRole("admin")}>
              <ShieldIcon />
              Make admin
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => changeRole("member")}>
              <UserRoundIcon />
              Change to member
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setTransferError(null)
              setConfirmOpen(true)
            }}
          >
            <CrownIcon />
            Transfer ownership…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => !pending && setConfirmOpen(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make {member.name} the owner?</DialogTitle>
            <DialogDescription>
              {member.name} will become the owner of {organizationName}, and
              you&apos;ll become an admin. Only the owner can change roles,
              transfer ownership and delete the organization, so you won&apos;t
              be able to undo this yourself.
            </DialogDescription>
          </DialogHeader>
          {transferError && (
            <p role="alert" className="text-sm text-destructive">
              {transferError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button disabled={pending} onClick={transfer}>
              {pending ? "Transferring…" : "Transfer ownership"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
