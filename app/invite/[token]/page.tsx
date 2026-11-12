import type { Metadata } from "next"
import Link from "next/link"

import {
  InvitationResponse,
  SwitchAccount,
} from "@/components/invitation-actions"
import { Logo } from "@/components/logo"
import { OrganizationAvatar } from "@/components/organization-avatar"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { getInvitation } from "@/lib/invitations"
import { getUser } from "@/lib/organizations"

export const metadata: Metadata = { title: "Invitation | OfficeTruck" }

const ROLE_LABELS = { admin: "an admin", member: "a member" }

const expiryFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  timeZone: "UTC",
})

export default async function InvitationPage({
  params,
}: PageProps<"/invite/[token]">) {
  const { token } = await params
  const [invitation, user] = await Promise.all([
    getInvitation(token),
    getUser(),
  ])
  const next = `/invite/${token}`

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Logo className="self-center" />
        <Card>
          {!invitation ? (
            <>
              <CardHeader className="text-center">
                <CardTitle className="text-xl">
                  This invitation isn&apos;t valid
                </CardTitle>
                <CardDescription className="text-balance">
                  It may have expired, been used already, or been revoked. Ask
                  whoever invited you to send a new one.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link
                  href="/"
                  className={buttonVariants({
                    variant: "outline",
                    className: "w-full",
                  })}
                >
                  Go to OfficeTruck
                </Link>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="items-center text-center">
                <OrganizationAvatar
                  name={invitation.organizationName}
                  className="mx-auto mb-2 size-12 text-lg"
                />
                <CardTitle className="text-xl">
                  Join {invitation.organizationName}
                </CardTitle>
                <CardDescription className="text-balance">
                  {invitation.invitedByName ?? "Someone"} invited you to join as{" "}
                  {ROLE_LABELS[invitation.role]}. The invitation is for{" "}
                  <span className="font-medium text-foreground">
                    {invitation.email}
                  </span>{" "}
                  and expires on{" "}
                  {expiryFormat.format(new Date(invitation.expiresAt))}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!user ? (
                  <div className="flex flex-col gap-3">
                    <Link
                      href={`/signup?${new URLSearchParams({ next, email: invitation.email })}`}
                      className={buttonVariants()}
                    >
                      Create an account to join
                    </Link>
                    <Link
                      href={`/login?${new URLSearchParams({ next, email: invitation.email })}`}
                      className={buttonVariants({ variant: "outline" })}
                    >
                      I already have an account
                    </Link>
                  </div>
                ) : user.email?.toLowerCase() === invitation.email ? (
                  <InvitationResponse token={token} />
                ) : (
                  <div className="flex flex-col gap-3">
                    <p className="text-center text-sm text-balance text-muted-foreground">
                      You&apos;re signed in as{" "}
                      <span className="font-medium text-foreground">
                        {user.email}
                      </span>
                      . Sign in with {invitation.email} to accept.
                    </p>
                    <SwitchAccount next={next} email={invitation.email} />
                  </div>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
