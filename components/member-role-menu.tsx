"use client"

import {
  CrownIcon,
  EllipsisIcon,
  ShieldIcon,
  UserRoundIcon,
  UserRoundMinusIcon,
} from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  changeMemberRole,
  removeMember,
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

type Confirm = "transfer" | "remove" | null

/**
 * The menu on another member's row. The owner can switch them between admin
 * and member, hand them ownership (which makes the current owner an admin),
 * or remove them. Admins can only remove members.
 */
export function MemberRoleMenu({
  organizationId,
  organizationName,
  member,
  canChangeRole,
  canRemove,
}: {
  organizationId: string
  organizationName: string
  member: { id: string; name: string; role: "admin" | "member" }
  /** Owner only: change role and transfer ownership. */
  canChangeRole: boolean
  canRemove: boolean
}) {
  const [pending, setPending] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

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

  async function runConfirmed() {
    setPending(true)
    setConfirmError(null)
    const result =
      confirm === "transfer"
        ? await transferOwnership(organizationId, member.id)
        : await removeMember(organizationId, member.id)
    setPending(false)
    if ("error" in result) {
      setConfirmError(result.error)
      return
    }
    setConfirm(null)
    toast.success(
      confirm === "transfer"
        ? `${member.name} is now the owner. You're an admin.`
        : `${member.name} was removed from ${organizationName}.`
    )
  }

  function openConfirm(kind: Exclude<Confirm, null>) {
    setConfirmError(null)
    setConfirm(kind)
  }

  if (!canChangeRole && !canRemove) {
    return null
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
              aria-label={`Manage ${member.name}`}
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
          {canChangeRole && (
            <>
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
              <DropdownMenuItem onClick={() => openConfirm("transfer")}>
                <CrownIcon />
                Transfer ownership
              </DropdownMenuItem>
            </>
          )}
          {canChangeRole && canRemove && <DropdownMenuSeparator />}
          {canRemove && (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => openConfirm("remove")}
            >
              <UserRoundMinusIcon />
              Remove member
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => !pending && !open && setConfirm(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "transfer"
                ? `Make ${member.name} the owner?`
                : `Remove ${member.name}?`}
            </DialogTitle>
            <DialogDescription>
              {confirm === "transfer" ? (
                <>
                  {member.name} will become the owner of {organizationName},
                  and you&apos;ll become an admin. Only the owner can change
                  roles, transfer ownership and delete the organization, so
                  you won&apos;t be able to undo this yourself.
                </>
              ) : (
                <>
                  {member.name} will lose access to {organizationName} right
                  away. To bring them back, you&apos;ll need to invite them
                  again.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {confirmError && (
            <p role="alert" className="text-sm text-destructive">
              {confirmError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </Button>
            <Button
              variant={confirm === "remove" ? "destructive" : "default"}
              disabled={pending}
              onClick={runConfirmed}
            >
              {confirm === "transfer"
                ? pending
                  ? "Transferring…"
                  : "Transfer ownership"
                : pending
                  ? "Removing…"
                  : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
