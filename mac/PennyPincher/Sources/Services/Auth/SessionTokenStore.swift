import Foundation
import Security

/// Where the token bytes live. The app uses the Keychain; tests use memory.
protocol TokenBacking: Sendable {
    func read() -> String?
    func write(_ token: String)
    func delete()
}

/// The only reader and writer of the session token (mac/AGENTS.md). Requests
/// read it through `token`, so a replaced token (after a password change) is
/// used at once.
final class SessionTokenStore: Sendable {
    private let backing: any TokenBacking
    private let lock = NSLock()
    nonisolated(unsafe) private var cached: String?

    init(backing: any TokenBacking = KeychainTokenBacking()) {
        self.backing = backing
        cached = backing.read()
    }

    var token: String? {
        lock.withLock { cached }
    }

    func save(_ token: String) {
        lock.withLock {
            cached = token
            backing.write(token)
        }
    }

    func clear() {
        lock.withLock {
            cached = nil
            backing.delete()
        }
    }
}

/// The data-protection Keychain (needs the app's keychain access group).
struct KeychainTokenBacking: TokenBacking {
    var service = "app.pennypincher.session"
    var account = "token"

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: service,
         kSecAttrAccount as String: account,
         kSecUseDataProtectionKeychain as String: true]
    }

    func read() -> String? {
        var query = query
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func write(_ token: String) {
        let data = Data(token.utf8)
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var add = query
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    func delete() {
        SecItemDelete(query as CFDictionary)
    }
}

/// For tests and previews: nothing touches the Keychain.
final class MemoryTokenBacking: TokenBacking {
    private let lock = NSLock()
    nonisolated(unsafe) private var value: String?

    init(_ token: String? = nil) { value = token }

    func read() -> String? { lock.withLock { value } }
    func write(_ token: String) { lock.withLock { value = token } }
    func delete() { lock.withLock { value = nil } }
}
