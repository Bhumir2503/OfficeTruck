"use client"

import {
  CornerDownLeft,
  Search,
  SlidersHorizontal,
  UserRoundPlus,
} from "lucide-react"
import { useMemo, useState } from "react"

import {
  SettingsCard,
  SettingsCardFooter,
  SettingsPage,
} from "@/components/settings/settings-card"
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
import type { OrganizationRole } from "@/lib/organizations"

export interface Member {
  id: string
  name: string
  /** Only known for the signed-in user; other members' emails aren't readable. */
  email?: string
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

const INVITE_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
]

const UsersTable = ({ users }: { users: Member[] }) => {
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
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.length === 0 && (
          <TableRow>
            <TableCell
              colSpan={3}
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
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary uppercase">
                  {user.name.charAt(0) || "?"}
                </span>
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

// Inviting isn't built yet: the form shows what it will look like, and says so.
const InviteUserForm = () => {
  return (
    <Dialog>
      <DialogTrigger render={<Button className="shrink-0" />}>
        <UserRoundPlus />
        Add member
      </DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden p-0">
        <DialogTitle className="flex items-center gap-2 border-b p-4 text-sm font-medium">
          <UserRoundPlus className="size-4" />
          Add new member
        </DialogTitle>
        <form
          autoComplete="off"
          onSubmit={(e) => e.preventDefault()}
          className="flex flex-col gap-4 bg-muted pt-4"
        >
          <fieldset disabled className="flex flex-col gap-4 px-4">
            <div className="space-y-1">
              <Label htmlFor="invite-email" className="text-xs">
                Email address
              </Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="driver@yourcompany.com"
                className="bg-background"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Assign role</Label>
              <Select defaultValue="member" items={INVITE_ROLES}>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {INVITE_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </fieldset>
          <DialogFooter className="items-center border-t bg-background px-4 py-3 sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Sending invites is coming soon.
            </p>
            <Button size="sm" type="submit" disabled>
              Send invite <CornerDownLeft />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface SettingsMembers1Props {
  heading?: string
  subHeading?: string
  users: Member[]
  canInvite?: boolean
}

const SettingsMembers1 = ({
  heading = "Members",
  subHeading = "Everyone with access to your organization, and the role each person has.",
  users,
  canInvite = false,
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
      action={canInvite && <InviteUserForm />}
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
        <UsersTable users={filteredUsers} />
      </SettingsCard>
    </SettingsPage>
  )
}

export { SettingsMembers1 }
