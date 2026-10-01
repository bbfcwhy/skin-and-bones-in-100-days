enum DayStatus: Equatable {
    case complete
    case partial
    case empty
}

struct WeekDay: Equatable {
    let date: LocalDate
    let status: DayStatus
    let isToday: Bool
}

/// 進度：每天全勾、部分或沒勾，本週 7 個圓點，連續全勾天數。
enum DailyProgress {
    /// 只算當天清單上的項目：週日 7 項，其他天 6 項。
    static func status(on date: LocalDate, records: CheckRecords) -> DayStatus {
        let items = Checklist.items(on: date)
        let checkedCount = items.filter { records.isChecked($0.id, on: date) }.count
        if checkedCount == 0 { return .empty }
        return checkedCount == items.count ? .complete : .partial
    }

    /// 週一到週日，跟計畫頁的週課表一樣從週一開始。
    static func week(containing today: LocalDate, records: CheckRecords) -> [WeekDay] {
        let monday = today.mondayOfWeek
        return (0..<7).map { offset in
            let date = monday.adding(days: offset)
            return WeekDay(date: date, status: status(on: date, records: records), isToday: date == today)
        }
    }

    /// 連續全勾天數。今天還沒全勾時，從昨天往回算。
    static func streak(today: LocalDate, records: CheckRecords) -> Int {
        var date = status(on: today, records: records) == .complete ? today : today.adding(days: -1)
        var count = 0
        while status(on: date, records: records) == .complete {
            count += 1
            date = date.adding(days: -1)
        }
        return count
    }
}
