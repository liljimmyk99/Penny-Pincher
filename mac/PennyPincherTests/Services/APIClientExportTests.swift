import Foundation
import Testing
@testable import PennyPincher

@Suite("API client: export")
struct APIClientExportTests {
    private func client(_ replies: [ScriptedTransport.Reply]) -> (APIClient, ScriptedTransport) {
        let transport = ScriptedTransport(replies)
        let tokens = TokenLog()
        let client = APIClient(serverURL: URL(string: "https://spend.example.test")!,
                               token: { tokens.token(forceRefresh: $0) }, onSessionError: { _ in },
                               transport: transport)
        return (client, transport)
    }

    @Test("An Excel export returns the bytes and the server's file name")
    func xlsx() async throws {
        let bytes = Data([0x50, 0x4B, 0x03, 0x04])
        let (client, transport) = client([.init(
            status: 200, file: bytes,
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers: ["Content-Disposition": #"attachment; filename="penny-pincher-export.xlsx""#])])
        let file = try await client.exportData(format: .xlsx)
        #expect(transport.requests[0].path == "/v1/export?format=xlsx")
        #expect(file.data == bytes && file.fileName == "penny-pincher-export.xlsx")
    }

    @Test("A CSV export is a zip, named by the fallback when the server sends no name")
    func csv() async throws {
        let (client, transport) = client([.init(status: 200, file: Data([1, 2]), contentType: "application/zip")])
        let file = try await client.exportData(format: .csv)
        #expect(transport.requests[0].path == "/v1/export?format=csv")
        #expect(file.fileName == "penny-pincher-export.zip")
    }

    @Test("A path in the header's file name is dropped")
    func fileNameSafety() {
        #expect(APIClient.fileName(from: #"attachment; filename="../../evil.xlsx""#) == "evil.xlsx")
        #expect(APIClient.fileName(from: nil) == nil)
    }

    @Test("A refused export throws the server's error")
    func failure() async {
        let json = #"{"error":{"code":"rate_limited","message":"Slow down"}}"#
        let (client, _) = client([.init(status: 429, json: json)])
        await #expect(throws: APIError.self) { try await client.exportData(format: .xlsx) }
    }
}
