import Testing
@testable import PennyPincher

@MainActor
@Suite("Change password view model")
struct ChangePasswordViewModelTests {
    let auth = FakeAuth()
    let session: SessionService
    var changed = ChangedFlag()

    init() {
        auth.hasStoredSession = true
        session = SessionService(auth: auth, api: FakeAccountAPI(.success(.member)))
    }

    private func model(_ mode: ChangePasswordMode = .sheet) -> ChangePasswordViewModel {
        ChangePasswordViewModel(session: session, mode: mode, onChanged: { [changed] in changed.value = true })
    }

    private func fill(_ model: ChangePasswordViewModel, current: String = "old-password-1",
                      new: String = "new-password-123", repeated: String = "new-password-123") {
        model.current = current
        model.new = new
        model.repeated = repeated
    }

    @Test("The checklist follows the fields")
    func checklist() {
        let model = model()
        #expect(model.requirements.map(\.isMet) == [false, false, false])
        fill(model, new: "short", repeated: "other")
        #expect(model.requirements.map(\.isMet) == [false, true, false])
        fill(model, new: "old-password-1", repeated: "old-password-1")
        #expect(model.requirements.map(\.isMet) == [true, false, true])
        fill(model)
        #expect(model.requirements.map(\.isMet) == [true, true, true])
        #expect(model.canSubmit)
    }

    @Test("Needs the current password too")
    func needsCurrent() {
        let model = model()
        fill(model, current: "")
        #expect(!model.canSubmit)
    }

    @Test("A change signs in, clears the fields and reports done")
    func success() async {
        let model = model()
        fill(model)
        await model.submit()
        #expect(auth.calls == ["change:old-password-1>new-password-123"])
        #expect(model.current.isEmpty && model.new.isEmpty && model.repeated.isEmpty)
        #expect(model.generalError == nil)
        #expect(changed.value)
        #expect(session.phase == .signedIn(.member))
    }

    @Test("A wrong current password marks that field and keeps the session")
    func wrongCurrent() async {
        auth.changeResult = .failure(.code("invalid_credentials", status: 401))
        let model = model()
        fill(model)
        await model.submit()
        #expect(model.currentError == "That isn’t your current password.")
        #expect(model.isCurrentInvalid)
        #expect(model.generalError == nil)
        #expect(!changed.value)
    }

    @Test("A weak password shows the server's detail on the new field")
    func weak() async {
        var error = APIError.code("weak_password", status: 400)
        error.details = [.init(field: "new_password", issue: "Too short.")]
        auth.changeResult = .failure(error)
        let model = model()
        fill(model)
        await model.submit()
        #expect(model.newError == "Too short.")
        #expect(model.generalError == nil)
    }

    @Test("Other failures show as a general error")
    func general() async {
        auth.changeResult = .failure(.network())
        let model = model()
        fill(model)
        await model.submit()
        #expect(model.generalError == APIError.network().message)
    }

    @Test("Forced mode's secondary button signs out; the sheet's cancels")
    func secondary() async {
        let forced = model(.forced)
        fill(forced)
        forced.secondary()
        await settle()
        #expect(auth.calls == ["signOut"])
        #expect(forced.new.isEmpty)

        let sheet = model(.sheet)
        sheet.secondary()
        #expect(changed.value)
    }
}

final class ChangedFlag: @unchecked Sendable {
    var value = false
}
