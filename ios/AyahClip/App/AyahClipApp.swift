import SwiftUI

@main
struct AyahClipApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .preferredColorScheme(.dark)
                .onOpenURL { url in
                    model.receiveSharedURL(url)
                }
        }
    }
}

