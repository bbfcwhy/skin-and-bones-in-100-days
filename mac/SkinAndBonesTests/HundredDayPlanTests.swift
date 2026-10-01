import Testing

struct HundredDayPlanTests {
    @Test("第 N / 100 天逐日符合計畫頁", arguments: PlanFixture.shared.days)
    func matchesPlanPage(_ expected: PlanFixture.Day) throws {
        let date = try #require(LocalDate(key: expected.date))
        #expect(HundredDayPlan.progressText(on: date) == expected.progressText)
    }

    @Test("8/10 是第 1 天，11/17 是第 100 天")
    func firstAndLastDay() {
        #expect(HundredDayPlan.progressText(on: LocalDate(2026, 8, 10)) == "第 1 / 100 天")
        #expect(HundredDayPlan.progressText(on: LocalDate(2026, 11, 17)) == "第 100 / 100 天")
    }

    @Test("11/17 之後顯示 100 天計畫已完成")
    func afterLastDay() {
        #expect(HundredDayPlan.progressText(on: LocalDate(2026, 11, 18)) == "100 天計畫已完成")
        #expect(HundredDayPlan.progressText(on: LocalDate(2027, 3, 1)) == "100 天計畫已完成")
    }

    @Test("8/10 之前顯示尚未開始")
    func beforeFirstDay() {
        #expect(HundredDayPlan.progressText(on: LocalDate(2026, 8, 9)) == "尚未開始")
    }
}
