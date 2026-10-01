import AppKit

/// 把核心邏輯接到系統上：浮動視窗、選單列圖示、換日通知、開機自動啟動。
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private var model: TodayModel?
    private var panel: FloatingPanel?
    private var statusItem: NSStatusItem?
    private var dayWatcher: DayChangeWatcher?
    private let panelMenuItem = NSMenuItem(title: "隱藏視窗", action: #selector(togglePanel), keyEquivalent: "")
    private let loginMenuItem = NSMenuItem(title: "開機自動啟動", action: #selector(toggleLoginItem), keyEquivalent: "")

    func applicationDidFinishLaunching(_ notification: Notification) {
        let model = TodayModel(store: JSONFileStore(fileURL: AppPaths.recordsFile))
        let panel = FloatingPanel(content: TodayView(model: model))
        panel.restorePosition()
        panel.orderFrontRegardless()
        self.model = model
        self.panel = panel

        setUpStatusItem()
        dayWatcher = DayChangeWatcher { [weak model] in
            model?.refreshToday()
        }
        LoginItem.registerOnceIfInstalled()
    }

    /// 在 Finder 再開一次 App 時，把藏起來的視窗叫回來。
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        panel?.orderFrontRegardless()
        return false
    }

    private func setUpStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = NSImage(systemSymbolName: "checklist", accessibilityDescription: "100 天減脂")
        let menu = NSMenu()
        menu.delegate = self
        panelMenuItem.target = self
        loginMenuItem.target = self
        let quitItem = NSMenuItem(title: "結束", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        quitItem.target = NSApp
        menu.items = [panelMenuItem, loginMenuItem, .separator(), quitItem]
        item.menu = menu
        statusItem = item
    }

    /// 選單每次打開前才讀最新狀態，不用另外同步。
    func menuNeedsUpdate(_ menu: NSMenu) {
        panelMenuItem.title = panel?.isVisible == true ? "隱藏視窗" : "顯示視窗"
        loginMenuItem.state = LoginItem.isEnabled ? .on : .off
    }

    @objc private func togglePanel() {
        guard let panel else { return }
        if panel.isVisible {
            panel.orderOut(nil)
        } else {
            panel.orderFrontRegardless()
        }
    }

    @objc private func toggleLoginItem() {
        LoginItem.toggle()
    }
}

enum AppPaths {
    /// ~/Library/Application Support/com.lazzymerlin.SkinAndBones/checks.json。
    /// 截圖驗收時用 `-dataDirectory <資料夾>` 啟動，改讀寫那個資料夾，不碰真正的紀錄。
    static var recordsFile: URL {
        // 只認啟動參數，不認 defaults write 寫進去的永久設定，正式使用時不會被悄悄導走。
        let arguments = UserDefaults.standard.volatileDomain(forName: UserDefaults.argumentDomain)
        if let custom = arguments["dataDirectory"] as? String, !custom.isEmpty {
            return URL(fileURLWithPath: custom, isDirectory: true).appendingPathComponent("checks.json")
        }
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return support
            .appendingPathComponent(Bundle.main.bundleIdentifier ?? "com.lazzymerlin.SkinAndBones", isDirectory: true)
            .appendingPathComponent("checks.json")
    }
}
