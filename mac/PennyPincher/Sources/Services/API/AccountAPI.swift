/// What the session needs from the API. A protocol so the session and view
/// models can be tested without a server.
protocol AccountAPI: Sendable {
    func me() async throws(APIError) -> Account
}
