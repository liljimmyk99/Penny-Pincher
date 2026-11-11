/// Which step of the import flow the screen shows.
enum ImportStage: Equatable {
    case upload
    case review
    case importing
    case finished
}
