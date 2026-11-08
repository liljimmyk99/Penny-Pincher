import FirebaseAuth
import Foundation
import Testing
@testable import PennyPincher

@Suite("Auth errors")
struct AuthErrorTests {
    @Test("Maps Firebase codes", arguments: [
        (AuthErrorCode.invalidCredential, AuthError.Code.invalidCredentials),
        (.wrongPassword, .invalidCredentials),
        (.userNotFound, .userNotFound),
        (.invalidEmail, .invalidEmail),
        (.userDisabled, .userDisabled),
        (.adminRestrictedOperation, .noAccess),
        (.tooManyRequests, .tooManyRequests),
        (.networkError, .network),
        (.webContextCancelled, .cancelled),
        (.operationNotAllowed, .providerDisabled),
        (.accountExistsWithDifferentCredential, .accountExists),
        (.internalError, .unknown),
    ])
    @MainActor
    func mapsFirebaseCodes(firebaseCode: AuthErrorCode, expected: AuthError.Code) {
        let error = NSError(domain: AuthErrors.domain, code: firebaseCode.rawValue)
        #expect(FirebaseAuthService.map(error).code == expected)
    }

    @Test("Maps other errors")
    @MainActor
    func mapsOtherErrors() {
        #expect(FirebaseAuthService.map(URLError(.timedOut)).code == .network)
        #expect(FirebaseAuthService.map(NSError(domain: "other", code: 1)).code == .unknown)
    }

    @Test("Unknown accounts get the same message as a wrong password")
    func noEnumeration() {
        #expect(AuthError(.userNotFound).message == AuthError(.invalidCredentials).message)
        #expect(AuthError(.userNotFound).isCredentialError)
        #expect(!AuthError(.network).isCredentialError)
    }

    @Test("Cancelled has no message")
    func cancelled() {
        #expect(AuthError(.cancelled).message.isEmpty)
    }
}
