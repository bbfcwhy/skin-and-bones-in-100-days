import SwiftUI

@main
struct SkinAndBonesApp: App {
    var body: some Scene {
        MenuBarExtra("100 天減脂", systemImage: "checklist") {
            Button("結束") { NSApplication.shared.terminate(nil) }
        }
    }
}
