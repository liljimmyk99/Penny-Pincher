import Testing
@testable import PennyPincher

@Suite("Session token store")
struct SessionTokenStoreTests {
    @Test("Reads a stored token, saves, replaces and clears")
    func lifecycle() {
        let backing = MemoryTokenBacking("saved")
        let store = SessionTokenStore(backing: backing)
        #expect(store.token == "saved")
        store.save("next")
        #expect(store.token == "next")
        #expect(backing.read() == "next")
        store.clear()
        #expect(store.token == nil)
        #expect(backing.read() == nil)
    }
}
