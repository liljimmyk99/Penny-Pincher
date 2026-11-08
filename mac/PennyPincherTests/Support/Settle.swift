/// Lets main-actor work started by a model (its `Task`s) finish. Swift Testing
/// runs suites in parallel, so this yields, sleeps briefly, then yields again.
@MainActor
func settle() async {
    for _ in 0..<20 { await Task.yield() }
    try? await Task.sleep(for: .milliseconds(20))
    for _ in 0..<20 { await Task.yield() }
}
