/// 100 天計畫的進度：2026-08-10 是第 1 天，11-17 是第 100 天。
enum HundredDayPlan {
    static let firstDay = LocalDate(2026, 8, 10)
    static let lastDay = LocalDate(2026, 11, 17)

    static func progressText(on date: LocalDate) -> String {
        if date < firstDay { return "尚未開始" }
        if date > lastDay { return "100 天計畫已完成" }
        return "第 \(date.days(since: firstDay) + 1) / 100 天"
    }
}
