import Foundation
import Supabase

/// The one Supabase client for the app. The project comes from
/// Config/Secrets.xcconfig through Info.plist.
enum SupabaseService {
    static let client: SupabaseClient = {
        let info = Bundle.main.infoDictionary ?? [:]
        guard
            let host = info["SupabaseHost"] as? String, !host.isEmpty, !host.hasPrefix("$("),
            let key = info["SupabasePublishableKey"] as? String, !key.isEmpty, !key.hasPrefix("$("),
            let url = URL(string: "https://\(host)")
        else {
            fatalError("Supabase isn't configured. Copy ios/Config/Secrets.example.xcconfig to Secrets.xcconfig.")
        }
        return SupabaseClient(
            supabaseURL: url,
            supabaseKey: key,
            options: SupabaseClientOptions(
                auth: .init(emitLocalSessionAsInitialSession: true)
            )
        )
    }()
}
