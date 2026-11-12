"use client"

import {
  CornerDownLeft,
  Mail,
  RotateCw,
  Search,
  SlidersHorizontal,
  UserRoundPlus,
  X,
} from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import {
  inviteMember,
  resendInvitation,
  revokeInvitation,
  type ActionResult,
} from "@/app/org/[slug]/settings/members/actions"
import {
  SettingsCard,
  SettingsCardFooter,
  SettingsPage,
} from "@/components/settings/settings-card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { MemberRoleMenu } from "@/components/member-role-menu"
import { Field, FieldError } from "@/components/ui/field"
import { useZodForm } from "@/hooks/use-zod-form"
import type { PendingInvitation } from "@/lib/invitations"
import type { OrganizationRole } from "@/lib/organizations"
import { inviteSchema, type InviteRole } from "@/lib/schemas/invitation"

export interface Member {
  id: string
  name: string
  /** Only known for the signed-in user; other members' emails aren't readable. */
  email?: string
  avatarUrl: string | null
  role: OrganizationRole
  joinedAt: string
  isYou: boolean
}

const ROLE_LABELS: Record<OrganizationRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}

// A fixed time zone so the server render and the browser agree on the date.
const joined = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
})

const INVITE_ROLE_OPTIONS = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
]

type RoleChanges = { organizationId: string; organizationName: string }

const UsersTable = ({
  users,
  roleChanges,
}: {
  users: Member[]
  /** Set for the owner, who gets a menu on everyone else's row. */
  roleChanges: RoleChanges | null
}) => {
  return (
    // Line the first and last columns up with the card's padding.
    <Table className="[&_td:first-child]:pl-6 [&_td:last-child]:pr-6 [&_th:first-child]:pl-6 [&_th:last-child]:pr-6">
      <TableHeader className="bg-muted/40">
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Role</TableHead>
          <TableHead className="hidden text-right sm:table-cell">
            Joined
          </TableHead>
          {roleChanges && (
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          )}
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={roleChanges ? 4 : 3}
              className="h-24 text-center text-muted-foreground"
            >
              No members match your search.
            </TableCell>
          </TableRow>
        )}
        {users.map((user) => (
          <TableRow key={user.id}>
            <TableCell className="max-w-72 py-3">
              <div className="flex items-center gap-3">
                <Avatar>
                  {user.avatarUrl && (
                    <AvatarImage src={user.avatarUrl} alt="" />
                  )}
                  <AvatarFallback className="bg-primary/10 font-semibold text-primary uppercase">
                    {user.name.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{user.name}</span>
                    {user.isYou && <Badge variant="outline">You</Badge>}
                  </div>
                  {user.email && (
                    <div className="truncate text-sm text-muted-foreground">
                      {user.email}
                    </div>
                  )}
                </div>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={user.role === "owner" ? "default" : "secondary"}>
                {ROLE_LABELS[user.role]}
              </Badge>
            </TableCell>
            <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
              {joined.format(new Date(user.joinedAt))}
            </TableCell>
            {roleChanges && (
              <TableCell className="text-right">
                {user.role !== "owner" && !user.isYou && (
                  <MemberRoleMenu
                    organizationId={roleChanges.organizationId}
                    organizationName={roleChanges.organizationName}
                    member={{ id: user.id, name: user.name, role: user.role }}
                  />
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function InviteUserForm({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false)
  const [role, setRole] = useState<InviteRole>("member")
  const { errors, formError, pending, formProps } = useZodForm(
    inviteSchema,
    async (values) => {
      const result = await inviteMember(organizationId, values)
      if ("error" in result) {
        return result.error
      }
      toast.success(`Invitation sent to ${values.email}.`)
      setOpen(false)
    }
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setRole("member")
        }
      }}
    >
      <DialogTrigger render={<Button className="shrink-0" />}>
        <UserRoundPlus />
        Invite member
      </DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden p-0">
        <DialogTitle className="flex items-center gap-2 border-b p-4 text-sm font-medium">
          <UserRoundPlus className="size-4" />
          Invite a new member
        </DialogTitle>
        <form
          autoComplete="off"
          {...formProps}
          className="flex flex-col gap-4 bg-muted pt-4"
        >
          <fieldset disabled={pending} className="flex flex-col gap-4 px-4">
            <Field data-invalid={!!errors.email} className="gap-1">
              <Label htmlFor="invite-email" className="text-xs">
                Email address
              </Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                placeholder="driver@yourcompany.com"
                className="bg-background"
                aria-invalid={!!errors.email}
                autoFocus
              />
              <FieldError errors={errors.email} />
            </Field>
            <div className="space-y-1">
              <Label className="text-xs">Assign role</Label>
              <input type="hidden" name="role" value={role} />
              <Select
                value={role}
                onValueChange={(value) => setRole(value as InviteRole)}
                items={INVITE_ROLE_OPTIONS}
              >
                <SelectTrigger
                  className="w-full bg-background"
                  aria-label="Assign role"
                >
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {INVITE_ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {role === "admin"
                  ? "Admins can edit company settings and invite people."
                  : "Members can work with loads, documents and invoices."}
              </p>
            </div>
          </fieldset>
          <DialogFooter className="items-center border-t bg-background px-4 py-3 sm:justify-between">
            <p
              role="status"
              className={
                formError
                  ? "text-sm text-destructive"
                  : "text-sm text-muted-foreground"
              }
            >
              {formError ?? "The link in the email expires in 7 days."}
            </p>
            <Button size="sm" type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send invite"} <CornerDownLeft />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function expiresIn(expiresAt: string, now: number) {
  const hours = Math.max(0, (new Date(expiresAt).getTime() - now) / 3_600_000)
  if (hours < 1) {
    return "Expires in less than an hour"
  }
  if (hours < 24) {
    const whole = Math.floor(hours)
    return `Expires in ${whole} ${whole === 1 ? "hour" : "hours"}`
  }
  // Rounded, so a just-sent (or just-resent) invitation reads "7 days".
  const days = Math.round(hours / 24)
  return `Expires in ${days} ${days === 1 ? "day" : "days"}`
}

function PendingInvitations({
  invitations,
}: {
  invitations: PendingInvitation[]
}) {
  const [busy, setBusy] = useState<string | null>(null)
  // Fixed per render of the list, so server and browser agree on the text.
  const [now] = useState(() => Date.now())

  async function run(
    id: string,
    action: () => Promise<ActionResult>,
    success: string
  ) {
    setBusy(id)
    const result = await action()
    setBusy(null)
    if ("error" in result) {
      toast.error(result.error)
    } else {
      toast.success(success)
    }
  }

  return (
    <SettingsCard
      title="Pending invitations"
      description="People who've been invited but haven't joined yet."
      contentClassName="px-0 pb-0"
      footer={
        <SettingsCardFooter
          hint={`${invitations.length} pending ${invitations.length === 1 ? "invitation" : "invitations"}. Unaccepted invitations are deleted after 7 days.`}
        />
      }
    >
      <ul className="divide-y border-t">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="flex items-center gap-3 px-6 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground">
              <Mail className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{invitation.email}</p>
              <p className="truncate text-sm text-muted-foreground">
                {expiresIn(invitation.expiresAt, now)}
              </p>
            </div>
            <Badge variant="secondary" className="hidden sm:inline-flex">
              {ROLE_LABELS[invitation.role]}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy === invitation.id}
              onClick={() =>
                run(
                  invitation.id,
                  () => resendInvitation(invitation.id),
                  `Invitation sent to ${invitation.email} again.`
                )
              }
            >
              <RotateCw />
              <span className="sr-only sm:not-sr-only">Resend</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={busy === invitation.id}
              onClick={() =>
                run(
                  invitation.id,
                  () => revokeInvitation(invitation.id),
                  `Invitation to ${invitation.email} revoked.`
                )
              }
            >
              <X />
              <span className="sr-only sm:not-sr-only">Revoke</span>
            </Button>
          </li>
        ))}
      </ul>
    </SettingsCard>
  )
}

interface SettingsMembers1Props {
  heading?: string
  subHeading?: string
  users: Member[]
  organizationId: string
  organizationName: string
  canInvite?: boolean
  /** Only the owner can change roles and transfer ownership. */
  canChangeRoles?: boolean
  /** Shown to owners and admins only. */
  invitations?: PendingInvitation[]
}

const SettingsMembers1 = ({
  heading = "Members",
  subHeading = "Everyone with access to your organization, and the role each person has.",
  users,
  organizationId,
  organizationName,
  canInvite = false,
  canChangeRoles = false,
  invitations = [],
}: SettingsMembers1Props) => {
  const [searchValue, setSearchValue] = useState("")
  const [selectedRoles, setSelectedRoles] = useState<OrganizationRole[]>([])

  const roles = useMemo(() => {
    return (Object.keys(ROLE_LABELS) as OrganizationRole[]).filter((role) =>
      users.some((user) => user.role === role)
    )
  }, [users])

  const filteredUsers = useMemo(() => {
    const query = searchValue.trim().toLowerCase()
    return users.filter((user) => {
      const isRoleSelected =
        selectedRoles.length === 0 || selectedRoles.includes(user.role)
      const isSearchMatch =
        user.name.toLowerCase().includes(query) ||
        !!user.email?.toLowerCase().includes(query)
      return isRoleSelected && isSearchMatch
    })
  }, [users, selectedRoles, searchValue])

  const toggleRole = (role: OrganizationRole) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    )
  }

  const filtering = searchValue.trim() !== "" || selectedRoles.length > 0

  return (
    <SettingsPage
      title={heading}
      description={subHeading}
      action={canInvite && <InviteUserForm organizationId={organizationId} />}
    >
      <SettingsCard
        title="Team"
        description="Search by name, or filter by role."
        contentClassName="px-0 pb-0"
        footer={
          <SettingsCardFooter
            hint={
              filtering
                ? `Showing ${filteredUsers.length} of ${users.length} ${users.length === 1 ? "member" : "members"}`
                : `${users.length} ${users.length === 1 ? "member" : "members"}`
            }
          />
        }
      >
        <div className="flex items-center gap-3 px-6 pb-4">
          <div className="relative w-full min-w-20">
            <Search className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search members"
              aria-label="Search members"
              className="pl-7"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            />
          </div>
          <Popover>
            <PopoverTrigger
              render={<Button variant="outline" className="shrink-0" />}
            >
              <SlidersHorizontal />
              Filter
              {selectedRoles.length > 0 && (
                <Badge variant="secondary">{selectedRoles.length}</Badge>
              )}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56">
              <div className="space-y-3">
                <p className="text-sm font-medium">Role</p>
                <div className="space-y-2">
                  {roles.map((role) => (
                    <Label key={role} className="cursor-pointer font-normal">
                      <Checkbox
                        checked={selectedRoles.includes(role)}
                        onCheckedChange={() => toggleRole(role)}
                      />
                      <span className="text-sm">{ROLE_LABELS[role]}</span>
                    </Label>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <UsersTable
          users={filteredUsers}
          roleChanges={
            canChangeRoles ? { organizationId, organizationName } : null
          }
        />
      </SettingsCard>
      {canInvite && invitations.length > 0 && (
        <PendingInvitations invitations={invitations} />
      )}
    </SettingsPage>
  )
}

export { SettingsMembers1 }
