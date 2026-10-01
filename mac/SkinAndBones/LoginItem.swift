import Foundation
import os
import ServiceManagement

/// 開機自動啟動（系統設定 → 一般 → 登入項目）。
enum LoginItem {
    private static let didRegisterKey = "didRegisterLoginItem"
    private static let logger = Logger(subsystem: "com.lazzymerlin.SkinAndBones", category: "LoginItem")

    static var isEnabled: Bool {
        SMAppService.mainApp.status == .enabled
    }

    /// 只有裝在 /Applications 的那份、第一次啟動時自動註冊一次。
    /// 開發中從 Xcode 跑的版本不註冊；威爾之後自己關掉，App 也不會再打開它。
    static func registerOnceIfInstalled() {
        guard Bundle.main.bundleURL.path.hasPrefix("/Applications/") else { return }
        guard !UserDefaults.standard.bool(forKey: didRegisterKey) else { return }
        if setEnabled(true) {
            UserDefaults.standard.set(true, forKey: didRegisterKey)
        }
    }

    @discardableResult
    static func setEnabled(_ enabled: Bool) -> Bool {
        do {
            if enabled {
                try SMAppService.mainApp.register()
            } else {
                try SMAppService.mainApp.unregister()
            }
            logger.notice("開機自動啟動：\(enabled ? "開" : "關", privacy: .public)，狀態 \(String(describing: SMAppService.mainApp.status), privacy: .public)")
            return true
        } catch {
            logger.error("開機自動啟動設定失敗：\(error.localizedDescription, privacy: .public)")
            return false
        }
    }
}
