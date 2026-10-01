import Foundation

/// 沒有時間與時區的日曆日期。核心邏輯都用它算，換日只在轉成 LocalDate 時判斷一次。
struct LocalDate: Hashable, Comparable {
    /// 距 1970-01-01 的天數。
    let dayNumber: Int

    init(dayNumber: Int) {
        self.dayNumber = dayNumber
    }

    /// 年月日換天數用 Howard Hinnant 的 days_from_civil 演算法。
    init(_ year: Int, _ month: Int, _ day: Int) {
        let shiftedYear = month <= 2 ? year - 1 : year
        let era = (shiftedYear >= 0 ? shiftedYear : shiftedYear - 399) / 400
        let yearOfEra = shiftedYear - era * 400
        let dayOfYear = (153 * (month > 2 ? month - 3 : month + 9) + 2) / 5 + day - 1
        let dayOfEra = yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear
        dayNumber = era * 146_097 + dayOfEra - 719_468
    }

    /// 用 calendar 的時區判斷這個時間點是哪一天。
    init(_ instant: Date, calendar: Calendar) {
        let parts = calendar.dateComponents([.year, .month, .day], from: instant)
        self.init(parts.year ?? 1970, parts.month ?? 1, parts.day ?? 1)
    }

    /// 只接受 `YYYY-MM-DD`，不存在的日期（例如 2 月 30 日）回 nil。
    init?(key: String) {
        let parts = key.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3,
              let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]) else {
            return nil
        }
        let date = LocalDate(year, month, day)
        guard date.key == key else { return nil }
        self = date
    }

    var year: Int { civil.year }
    var month: Int { civil.month }
    var day: Int { civil.day }

    var key: String {
        let parts = civil
        return String(format: "%04ld-%02ld-%02ld", parts.year, parts.month, parts.day)
    }

    /// 週一是 0，週日是 6。1970-01-01 是週四。
    var weekdayIndex: Int {
        ((dayNumber + 3) % 7 + 7) % 7
    }

    var mondayOfWeek: LocalDate {
        adding(days: -weekdayIndex)
    }

    func adding(days: Int) -> LocalDate {
        LocalDate(dayNumber: dayNumber + days)
    }

    func days(since other: LocalDate) -> Int {
        dayNumber - other.dayNumber
    }

    static func < (lhs: LocalDate, rhs: LocalDate) -> Bool {
        lhs.dayNumber < rhs.dayNumber
    }

    private struct Civil {
        let year: Int
        let month: Int
        let day: Int
    }

    /// 天數換年月日，Howard Hinnant 的 civil_from_days 演算法。
    private var civil: Civil {
        let shifted = dayNumber + 719_468
        let era = (shifted >= 0 ? shifted : shifted - 146_096) / 146_097
        let dayOfEra = shifted - era * 146_097
        let yearOfEra = (dayOfEra - dayOfEra / 1_460 + dayOfEra / 36_524 - dayOfEra / 146_096) / 365
        let dayOfYear = dayOfEra - (365 * yearOfEra + yearOfEra / 4 - yearOfEra / 100)
        let monthIndex = (5 * dayOfYear + 2) / 153
        let day = dayOfYear - (153 * monthIndex + 2) / 5 + 1
        let month = monthIndex < 10 ? monthIndex + 3 : monthIndex - 9
        let year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0)
        return Civil(year: year, month: month, day: day)
    }
}
