import { json, signInFirst } from "@/lib/dq/http"
import { createRequestClient } from "@/lib/supabase/request"

/**
 * For the phone app: the drivers the signed-in person is linked to (one per
 * carrier they drive for). Links any driver whose login phone matches their
 * verified number first.
 */
export async function GET(request: Request) {
  const { supabase, signedIn } = await createRequestClient(request)
  if (!signedIn) return signInFirst()
  await supabase.rpc("claim_driver_logins")
  const { data, error } = await supabase.rpc("my_dq_drivers")
  if (error)
    return json({ error: "Your driver files couldn't be loaded." }, 500)
  return json({ drivers: data ?? [] })
}
