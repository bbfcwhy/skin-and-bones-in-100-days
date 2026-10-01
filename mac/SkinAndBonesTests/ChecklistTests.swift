import Testing

struct ChecklistTests {
    private let thursday = LocalDate(2026, 10, 1)
    private let sunday = LocalDate(2026, 10, 4)
    private let monday = LocalDate(2026, 10, 5)

    @Test("平日 6 項，順序照規格")
    func weekdayItems() {
        let items = Checklist.items(on: thursday)
        #expect(items.map(\.id) == ["morning", "protein", "water", "steps", "workout", "last-bite"])
        #expect(items.map(\.title) == [
            "起床量晨重，喝 700 ml 水配肌酸",
            "蛋白質吃到 140 到 150 g",
            "3 杯水喝完，共 2.1 L",
            "走滿 10,000 步",
            "今天的運動做完：恢復瑜伽",
            "20:00 前吃完最後一口"
        ])
        #expect(items.first { $0.id == "steps" }?.detail == "復職後平日至少 8,000")
    }

    @Test("週日多一項量腰圍，放在最後")
    func sundayAddsWaist() {
        let items = Checklist.items(on: sunday)
        #expect(items.count == 7)
        #expect(items.last?.id == "waist")
        #expect(items.last?.title == "量腰圍")
        #expect(!Checklist.items(on: sunday.adding(days: -1)).contains { $0.id == "waist" })
        #expect(!Checklist.items(on: sunday.adding(days: 1)).contains { $0.id == "waist" })
    }

    @Test("運動項目顯示當天的運動名稱", arguments: PlanFixture.shared.days)
    func workoutItemShowsTodaysWorkout(_ expected: PlanFixture.Day) throws {
        let date = try #require(LocalDate(key: expected.date))
        let workoutItem = try #require(Checklist.items(on: date).first { $0.id == "workout" })
        #expect(workoutItem.title == "今天的運動做完：\(expected.workoutLabel)")
    }

    @Test("同一天的項目 id 不重複")
    func uniqueIDs() {
        for date in [thursday, sunday, monday] {
            let ids = Checklist.items(on: date).map(\.id)
            #expect(Set(ids).count == ids.count)
        }
    }
}
