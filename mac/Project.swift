import ProjectDescription

// The Mac app's Xcode project (mac/AGENTS.md, root AGENTS.md §10).
// `tuist generate` turns this into PennyPincher.xcworkspace; never edit the
// generated project. Local values (server, Firebase, signing team) come from
// Config/Local.xcconfig, which Config/App.xcconfig includes when it exists.

let bundleId = "app.pennypincher.mac"

let appSettings: Settings = .settings(
    base: [
        // Swift 6 language mode: complete strict concurrency checking.
        "SWIFT_VERSION": "6.0",
        "SWIFT_STRICT_CONCURRENCY": "complete",
        // Every user-facing string lives in Resources/Localizable.xcstrings.
        "LOCALIZATION_PREFERS_STRING_CATALOGS": "YES",
        "SWIFT_EMIT_LOC_STRINGS": "YES",
        "MARKETING_VERSION": "0.1.0",
        "CURRENT_PROJECT_VERSION": "1",
        "ENABLE_USER_SCRIPT_SANDBOXING": "YES",
        "ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME": "Primary",
        "CODE_SIGN_STYLE": "Automatic",
        "CODE_SIGN_IDENTITY": "Apple Development",
        "ENABLE_HARDENED_RUNTIME": "YES",
    ],
    configurations: [
        .debug(name: .debug, xcconfig: "Config/App.xcconfig"),
        .release(name: .release, xcconfig: "Config/App.xcconfig"),
    ]
)

let project = Project(
    name: "PennyPincher",
    options: .options(
        automaticSchemesOptions: .disabled,
        developmentRegion: "en"
    ),
    packages: [
        .remote(url: "https://github.com/firebase/firebase-ios-sdk", requirement: .upToNextMajor(from: "13.1.0")),
        .remote(url: "https://github.com/google/GoogleSignIn-iOS", requirement: .upToNextMajor(from: "10.1.0")),
        .remote(url: "https://github.com/apple/swift-openapi-generator", requirement: .upToNextMajor(from: "1.14.0")),
        .remote(url: "https://github.com/apple/swift-openapi-runtime", requirement: .upToNextMajor(from: "1.13.0")),
        .remote(url: "https://github.com/apple/swift-openapi-urlsession", requirement: .upToNextMajor(from: "1.4.0")),
    ],
    settings: .settings(base: ["SWIFT_VERSION": "6.0"]),
    targets: [
        .target(
            name: "PennyPincher",
            destinations: .macOS,
            product: .app,
            bundleId: bundleId,
            deploymentTargets: .macOS("26.0"),
            infoPlist: .extendingDefault(with: [
                // Localized in Resources/InfoPlist.xcstrings.
                "CFBundleDisplayName": "Penny Pincher",
                "LSApplicationCategoryType": "public.app-category.finance",
                "NSHumanReadableCopyright": "",
                // Read by AppConfig; set in Config/App.xcconfig and Local.xcconfig.
                "PPServerURL": "$(PP_SERVER_URL)",
                "PPFirebaseAPIKey": "$(FIREBASE_API_KEY)",
                "PPFirebaseProjectID": "$(FIREBASE_PROJECT_ID)",
                "PPFirebaseAppID": "$(FIREBASE_APP_ID)",
                "PPFirebaseSenderID": "$(FIREBASE_GCM_SENDER_ID)",
                "PPGoogleClientID": "$(GOOGLE_CLIENT_ID)",
                "PPFirebaseAuthEmulatorHost": "$(FIREBASE_AUTH_EMULATOR_HOST)",
                // Google sign-in returns to the app through its reversed client id.
                "CFBundleURLTypes": [
                    [
                        "CFBundleURLName": "google-sign-in",
                        "CFBundleURLSchemes": ["$(GOOGLE_REVERSED_CLIENT_ID)"],
                    ],
                ],
                // Plain HTTP only to local names (a dev API or the auth emulator);
                // everything else must use HTTPS (AGENTS.md §8).
                "NSAppTransportSecurity": ["NSAllowsLocalNetworking": true],
            ]),
            sources: ["PennyPincher/Sources/**/*.swift"],
            resources: [
                "PennyPincher/Resources/**",
                // swift-openapi-generator's build plugin only sees files that belong
                // to the target; Tuist keeps non-Swift files out of `sources`, so
                // these two join as resources (the way Xcode adds them by hand).
                "PennyPincher/Sources/Services/API/openapi.yaml",
                "PennyPincher/Sources/Services/API/openapi-generator-config.yaml",
            ],
            entitlements: .file(path: "PennyPincher/PennyPincher.entitlements"),
            dependencies: [
                .package(product: "OpenAPIGenerator", type: .plugin),
                .package(product: "OpenAPIRuntime"),
                .package(product: "OpenAPIURLSession"),
                .package(product: "FirebaseAuth"),
                .package(product: "GoogleSignIn"),
            ],
            settings: appSettings
        ),
        .target(
            name: "PennyPincherTests",
            destinations: .macOS,
            product: .unitTests,
            bundleId: "\(bundleId).tests",
            deploymentTargets: .macOS("26.0"),
            infoPlist: .default,
            sources: ["PennyPincherTests/**"],
            dependencies: [.target(name: "PennyPincher")],
            settings: appSettings
        ),
    ],
    schemes: [
        .scheme(
            name: "PennyPincher",
            shared: true,
            buildAction: .buildAction(targets: ["PennyPincher"]),
            testAction: .targets(["PennyPincherTests"]),
            runAction: .runAction(executable: "PennyPincher")
        ),
    ]
)
