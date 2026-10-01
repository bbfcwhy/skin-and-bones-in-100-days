import Testing

struct PlanFixtureTests {
    @Test("fixture 涵蓋 10/1 到 11/17 共 48 天")
    func coversFortyEightDays() {
        let days = PlanFixture.shared.days
        #expect(days.count == 48)
        #expect(days.first?.date == "2026-10-01")
        #expect(days.last?.date == "2026-11-17")
        #expect(Set(days.map(\.date)).count == days.count)
    }

    @Test("fixture 依台北時間產生")
    func usesTaipeiTime() {
        #expect(PlanFixture.shared.timeZone == "Asia/Taipei")
    }
}
