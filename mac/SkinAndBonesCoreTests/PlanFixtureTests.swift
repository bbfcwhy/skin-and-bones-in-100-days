import Testing

struct PlanFixtureTests {
    @Test func 涵蓋十月一日到十一月十七日共四十八天() {
        let days = PlanFixture.shared.days
        #expect(days.count == 48)
        #expect(days.first?.date == "2026-10-01")
        #expect(days.last?.date == "2026-11-17")
        #expect(Set(days.map(\.date)).count == days.count)
    }

    @Test func 依台北時間產生() {
        #expect(PlanFixture.shared.timeZone == "Asia/Taipei")
    }
}
