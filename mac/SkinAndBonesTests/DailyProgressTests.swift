import Testing

struct DailyProgressTests {
    private let monday = LocalDate(2026, 9, 28)
    private let tuesday = LocalDate(2026, 9, 29)
    private let wednesday = LocalDate(2026, 9, 30)
    private let thursday = LocalDate(2026, 10, 1)
    private let sunday = LocalDate(2026, 10, 4)

    private func checkAll(_ records: inout CheckRecords, on date: LocalDate) {
        for item in Checklist.items(on: date) where !records.isChecked(item.id, on: date) {
            records.toggle(item.id, on: date)
        }
    }

    private func status(_ date: LocalDate, _ records: CheckRecords) -> DayStatus {
        DailyProgress.status(on: date, records: records)
    }

    @Test("一天分成沒勾、部分、全勾")
    func dayStatus() {
        var records = CheckRecords()
        #expect(status(thursday, records) == .empty)
        records.toggle("water", on: thursday)
        #expect(status(thursday, records) == .partial)
        checkAll(&records, on: thursday)
        #expect(status(thursday, records) == .complete)
    }

    @Test("週日要連量腰圍共 7 項都勾才算全勾")
    func sundayNeedsWaist() {
        var records = CheckRecords()
        for item in Checklist.items(on: thursday) {
            records.toggle(item.id, on: sunday)
        }
        #expect(status(sunday, records) == .partial)
        records.toggle("waist", on: sunday)
        #expect(status(sunday, records) == .complete)
    }

    @Test("取消的勾和清單外的項目都不算")
    func ignoresUncheckedAndUnknownItems() {
        var records = CheckRecords(days: [thursday.key: ["old-item": true]])
        #expect(status(thursday, records) == .empty)
        records.toggle("water", on: thursday)
        records.toggle("water", on: thursday)
        #expect(status(thursday, records) == .empty)
    }

    @Test("本週是週一到週日 7 天，標出今天")
    func weekRunsMondayToSunday() {
        var records = CheckRecords()
        checkAll(&records, on: monday)
        records.toggle("water", on: tuesday)
        records.toggle("protein", on: thursday)
        let week = DailyProgress.week(containing: thursday, records: records)
        #expect(week.map(\.date) == (0..<7).map { monday.adding(days: $0) })
        #expect(week.map(\.status) == [.complete, .partial, .empty, .partial, .empty, .empty, .empty])
        #expect(week.map(\.isToday) == [false, false, false, true, false, false, false])
    }

    @Test("週日看到的本週也是從週一開始")
    func weekFromSunday() {
        let week = DailyProgress.week(containing: sunday, records: CheckRecords())
        #expect(week.first?.date == monday)
        #expect(week.last?.date == sunday)
        #expect(week.last?.isToday == true)
    }

    @Test("今天全勾時，連續天數算進今天")
    func streakIncludesCompletedToday() {
        var records = CheckRecords()
        for date in [tuesday, wednesday, thursday] {
            checkAll(&records, on: date)
        }
        #expect(DailyProgress.streak(today: thursday, records: records) == 3)
    }

    @Test("今天還沒全勾時，從昨天往回算")
    func streakStartsYesterdayWhenTodayIncomplete() {
        var records = CheckRecords()
        for date in [tuesday, wednesday] {
            checkAll(&records, on: date)
        }
        records.toggle("water", on: thursday)
        #expect(DailyProgress.streak(today: thursday, records: records) == 2)
        #expect(DailyProgress.streak(today: thursday, records: CheckRecords()) == 0)
    }

    @Test("中間斷一天就停，只勾一部分的一天也算斷")
    func streakStopsAtGap() {
        var records = CheckRecords()
        for date in [monday, tuesday, thursday] {
            checkAll(&records, on: date)
        }
        #expect(DailyProgress.streak(today: thursday, records: records) == 1)
        records.toggle("water", on: wednesday)
        #expect(DailyProgress.streak(today: thursday, records: records) == 1)
    }

    @Test("週日少量腰圍會中斷連續天數")
    func sundayWithoutWaistBreaksStreak() {
        let nextMonday = sunday.adding(days: 1)
        var records = CheckRecords()
        checkAll(&records, on: nextMonday)
        for item in Checklist.items(on: thursday) {
            records.toggle(item.id, on: sunday)
        }
        checkAll(&records, on: sunday.adding(days: -1))
        #expect(DailyProgress.streak(today: nextMonday, records: records) == 1)
    }
}
