#if DEBUG
import SwiftUI

#Preview("Change password · required") {
    ChangePasswordView(viewModel: PreviewData.changePassword(.forced))
        .frame(width: 720, height: 720)
}

#Preview("Change password · filled") {
    let viewModel = PreviewData.changePassword(.forced)
    viewModel.current = "temporary-password"
    viewModel.new = "a-new-long-password"
    viewModel.repeated = "a-new-long-password"
    return ChangePasswordView(viewModel: viewModel)
        .frame(width: 720, height: 720)
        .preferredColorScheme(.dark)
}

#Preview("Change password · sheet") {
    ChangePasswordView(viewModel: PreviewData.changePassword(.sheet))
}

#Preview("Change password · wrong current") {
    let viewModel = PreviewData.changePassword(
        .sheet, failure: APIError(code: "invalid_credentials", status: 401, message: ""))
    viewModel.current = "wrong"
    viewModel.new = "a-new-long-password"
    viewModel.repeated = "a-new-long-password"
    return ChangePasswordView(viewModel: viewModel).task { await viewModel.submit() }
}
#endif
