import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const SIGNED_OUT_ONLY_PATHS = ["/login", "/signup"]

function isSignedOutOnly(pathname: string) {
  return SIGNED_OUT_ONLY_PATHS.includes(pathname)
}

// "/" is included because it only routes signed-in users to their organization.
function requiresSignIn(pathname: string) {
  return pathname === "/" || pathname === "/org" || pathname.startsWith("/org/")
}

/** Refreshes the auth session and sends each visitor to the side they belong on. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value)
          )
        },
      },
    }
  )

  // Must run straight after creating the client: this is what refreshes an
  // expired session and writes the new cookies through setAll above.
  const { data } = await supabase.auth.getClaims()
  const { pathname } = request.nextUrl

  // Signed-in users go to "/", which routes them on to their organization.
  const destination = data?.claims
    ? isSignedOutOnly(pathname) && "/"
    : requiresSignIn(pathname) && "/login"

  if (destination) {
    const redirect = NextResponse.redirect(new URL(destination, request.url))
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  return response
}
