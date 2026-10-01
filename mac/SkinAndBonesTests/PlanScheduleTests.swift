import Testing

struct PlanScheduleTests {
    @Test("運動、熱量、A/B 逐日符合計畫頁算出的結果", arguments: PlanFixture.shared.days)
    func matchesPlanPage(_ expected: PlanFixture.Day) throws {
        let date = try #require(LocalDate(key: expected.date))
        let workout = PlanSchedule.workout(on: date)
        #expect(date.weekdayName == expected.weekday)
        #expect(workout.label == expected.workoutLabel)
        #expect(workout.note == expected.workoutNote)
        #expect(workout.strengthType?.rawValue == expected.strengthType)
        #expect(workout.dayType.name == expected.dayType)
        #expect(workout.dayType.calorieLabel == expected.calorieLabel)
    }

    @Test("A-B-A 週與 B-A-B 週交替，第 1 週（8/10 那週）是 A-B-A")
    func strengthWeeksAlternate() {
        let firstWeek = LocalDate(2026, 8, 10)
        #expect(PlanSchedule.workout(on: firstWeek.adding(days: 7)) == .strength(.b))
        #expect(PlanSchedule.workout(on: firstWeek.adding(days: 14)) == .strength(.a))
        #expect(PlanSchedule.workout(on: firstWeek.adding(days: 14 + 2)) == .strength(.b))
        #expect(PlanSchedule.workout(on: firstWeek.adding(days: 14 + 4)) == .strength(.a))
    }

    @Test("100 天之後週課表照常輪替")
    func continuesAfterHundredDays() {
        #expect(PlanSchedule.workout(on: LocalDate(2026, 11, 23)) == .strength(.b))
        #expect(PlanSchedule.workout(on: LocalDate(2026, 11, 30)) == .strength(.a))
        #expect(PlanSchedule.workout(on: LocalDate(2026, 11, 22)) == .recoveryYoga)
    }
}
