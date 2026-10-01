import Foundation

extension Calendar {
    /// 測試一律用台北時間，不吃跑測試那台 Mac 的時區設定。
    static var taipei: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Taipei")!
        return calendar
    }
}

/// 把 ISO 8601 字串（例如 `2026-10-01T23:59:59+08:00`）轉成 Date。
func instant(_ text: String) -> Date {
    guard let date = ISO8601DateFormatter().date(from: text) else {
        preconditionFailure("時間字串格式不對：\(text)")
    }
    return date
}
