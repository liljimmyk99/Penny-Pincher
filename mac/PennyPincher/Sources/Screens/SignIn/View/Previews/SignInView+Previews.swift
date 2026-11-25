#if DEBUG
import SwiftUI

#Preview("Sign in") {
    SignInView(viewModel: PreviewData.signIn())
        .frame(width: 720, height: 600)
}

#Preview("Sign in · Dark") {
    SignInView(viewModel: PreviewData.signIn())
        .frame(width: 720, height: 600)
        .preferredColorScheme(.dark)
}

#Preview("Sign in · session expired") {
    SignInView(viewModel: PreviewData.signIn(signedOutBy: "session_expired"))
        .frame(width: 720, height: 680)
}

#Preview("Sign in · wrong password") {
    let viewModel = PreviewData.signIn(failure: APIError(code: "invalid_credentials", status: 401, message: ""))
    viewModel.username = "alex"
    viewModel.password = "wrong-password"
    return SignInView(viewModel: viewModel)
        .frame(width: 720, height: 680)
        .task { await viewModel.signIn() }
}

#Preview("Sign in · too many attempts") {
    let viewModel = PreviewData.signIn(failure: APIError(code: "rate_limited", status: 429, message: ""))
    viewModel.username = "alex"
    viewModel.password = "wrong-password"
    return SignInView(viewModel: viewModel)
        .frame(width: 720, height: 680)
        .task { await viewModel.signIn() }
}
#endif
