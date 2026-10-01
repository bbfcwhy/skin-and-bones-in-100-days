import AppKit

// 選單列 App：Info.plist 設了 LSUIElement，不出現在 Dock，也不會被 Cmd-Tab 切到。
// 頂層程式本來就跑在主執行緒，這裡明講給編譯器知道。
MainActor.assumeIsolated {
    let delegate = AppDelegate()
    NSApplication.shared.delegate = delegate
    NSApplication.shared.run()
}
