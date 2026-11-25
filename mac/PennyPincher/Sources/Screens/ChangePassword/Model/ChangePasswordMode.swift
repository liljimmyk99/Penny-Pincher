/// Where Change password is shown.
enum ChangePasswordMode: Equatable {
    /// An admin set the password: replaces the app until it is changed.
    case forced
    /// Opened from the account menu, as a sheet.
    case sheet
}
