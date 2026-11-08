/// The request in flight, if any. Only one at a time.
enum SignInBusy: Equatable {
    case google
    case email
    case reset
}
