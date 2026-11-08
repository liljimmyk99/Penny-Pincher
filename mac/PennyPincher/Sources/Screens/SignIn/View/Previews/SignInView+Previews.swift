#if DEBUG
import SwiftUI

#Preview("Sign in") {
    SignInView(viewModel: PreviewData.signIn())
        .frame(width: 720, height: 640)
}

#Preview("Sign in · Dark") {
    SignInView(viewModel: PreviewData.signIn())
        .frame(width: 720, height: 640)
        .preferredColorScheme(.dark)
}

#Preview("Sign in · no Google") {
    SignInView(viewModel: PreviewData.signIn(supportsGoogle: false))
        .frame(width: 720, height: 600)
}

#Preview("Sign in · session expired") {
    SignInView(viewModel: PreviewData.signIn(signedOutBy: "session_expired"))
        .frame(width: 720, height: 700)
}

#Preview("Sign in · no access") {
    SignInView(viewModel: PreviewData.signIn(signedOutBy: "not_allowlisted"))
        .frame(width: 720, height: 720)
}

#Preview("Sign in · wrong password") {
    let viewModel = PreviewData.signIn(failure: AuthError(.invalidCredentials))
    viewModel.email = "alex@example.com"
    viewModel.password = "wrong-password"
    return SignInView(viewModel: viewModel)
        .frame(width: 720, height: 700)
        .task { await viewModel.signInWithEmail() }
}

#Preview("Reset password") {
    SignInView(viewModel: PreviewData.signIn(mode: .reset))
        .frame(width: 720, height: 560)
}

#Preview("Reset link sent") {
    SignInView(viewModel: PreviewData.signIn(mode: .sent))
        .frame(width: 720, height: 520)
}
#endif
