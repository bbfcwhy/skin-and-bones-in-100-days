import Foundation
import Testing

struct LocalDateTests {
    @Test("日期鍵是 YYYY-MM-DD")
    func keyFormat() {
        #expect(LocalDate(2026, 10, 1).key == "2026-10-01")
        #expect(LocalDate(2026, 8, 9).key == "2026-08-09")
    }

    @Test("星期以週一為 0、週日為 6")
    func weekdayIndex() {
        #expect(LocalDate(2026, 8, 10).weekdayIndex == 0)
        #expect(LocalDate(2026, 10, 1).weekdayIndex == 3)
        #expect(LocalDate(2026, 10, 4).weekdayIndex == 6)
        #expect(LocalDate(1969, 12, 31).weekdayIndex == 2)
    }

    @Test("加減天數會跨月、跨年、遇到閏年")
    func addingDays() {
        #expect(LocalDate(2026, 10, 31).adding(days: 1) == LocalDate(2026, 11, 1))
        #expect(LocalDate(2026, 12, 31).adding(days: 1) == LocalDate(2027, 1, 1))
        #expect(LocalDate(2028, 2, 28).adding(days: 1) == LocalDate(2028, 2, 29))
        #expect(LocalDate(2026, 3, 1).adding(days: -1) == LocalDate(2026, 2, 28))
    }

    @Test("兩個日期相差幾天")
    func daysSince() {
        #expect(LocalDate(2026, 11, 17).days(since: LocalDate(2026, 8, 10)) == 99)
        #expect(LocalDate(2026, 8, 10).days(since: LocalDate(2026, 11, 17)) == -99)
    }

    @Test("找出同一週的週一")
    func mondayOfWeek() {
        #expect(LocalDate(2026, 10, 1).mondayOfWeek == LocalDate(2026, 9, 28))
        #expect(LocalDate(2026, 10, 4).mondayOfWeek == LocalDate(2026, 9, 28))
        #expect(LocalDate(2026, 9, 28).mondayOfWeek == LocalDate(2026, 9, 28))
    }

    @Test("從日期鍵解析，不合法的回 nil")
    func parseKey() {
        #expect(LocalDate(key: "2026-10-01") == LocalDate(2026, 10, 1))
        #expect(LocalDate(key: "2026-02-30") == nil)
        #expect(LocalDate(key: "2026-13-01") == nil)
        #expect(LocalDate(key: "2026-1-1") == nil)
        #expect(LocalDate(key: "昨天") == nil)
    }

    @Test("用指定時區判斷今天是哪一天，午夜才換日")
    func fromInstantInTimeZone() {
        let taipei = Calendar.taipei
        #expect(LocalDate(instant("2026-10-01T23:59:59+08:00"), calendar: taipei) == LocalDate(2026, 10, 1))
        #expect(LocalDate(instant("2026-10-02T00:00:00+08:00"), calendar: taipei) == LocalDate(2026, 10, 2))
        #expect(LocalDate(instant("2026-10-01T16:30:00Z"), calendar: taipei) == LocalDate(2026, 10, 2))
    }
}
