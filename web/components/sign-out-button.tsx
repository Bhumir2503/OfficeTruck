"use client"

import { cn } from "cn"
import { LogOut } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useSignOut } from "@/hooks/use-sign-out"

export function SignOutButton({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { signOut, pending } = useSignOut()

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Sign out"
      title="Sign out"
      disabled={pending}
      onClick={signOut}
      className={cn(
        "text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/20",
        className
      )}
      {...props}
    >
      <LogOut className="size-5" />
    </Button>
  )
}
