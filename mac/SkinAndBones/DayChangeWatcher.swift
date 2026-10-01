import AppKit

/// 過午夜、睡眠喚醒、改系統時間或時區時呼叫 onChange；另外每 30 秒保底檢查一次。
/// onChange 要自己判斷是不是真的換日（TodayModel.refreshToday 會）。
@MainActor
final class DayChangeWatcher {
    private var tokens: [(NotificationCenter, NSObjectProtocol)] = []
    private var timer: Timer?

    init(onChange: @escaping @MainActor @Sendable () -> Void) {
        let fire: @Sendable (Notification) -> Void = { _ in MainActor.assumeIsolated { onChange() } }
        let center = NotificationCenter.default
        for name in [Notification.Name.NSCalendarDayChanged, .NSSystemClockDidChange, .NSSystemTimeZoneDidChange] {
            tokens.append((center, center.addObserver(forName: name, object: nil, queue: .main, using: fire)))
        }
        let workspace = NSWorkspace.shared.notificationCenter
        tokens.append((workspace, workspace.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main, using: fire)))

        let timer = Timer(timeInterval: 30, repeats: true) { _ in MainActor.assumeIsolated { onChange() } }
        timer.tolerance = 5
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
    }

    deinit {
        timer?.invalidate()
        for (center, token) in tokens {
            center.removeObserver(token)
        }
    }
}
