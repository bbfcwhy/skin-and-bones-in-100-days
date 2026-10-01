import Foundation
import Testing

struct CheckRecordsTests {
    private let day = LocalDate(2026, 10, 1)

    @Test("點一次打勾，再點一次取消")
    func toggleTwiceUnchecks() {
        var records = CheckRecords()
        records.toggle("water", on: day)
        #expect(records.isChecked("water", on: day))
        records.toggle("water", on: day)
        #expect(!records.isChecked("water", on: day))
    }

    @Test("不同天的勾選互不影響")
    func daysAreIndependent() {
        var records = CheckRecords()
        records.toggle("water", on: day)
        #expect(!records.isChecked("water", on: day.adding(days: 1)))
        #expect(!records.isChecked("protein", on: day))
    }

    @Test("存檔格式是 {日期: {項目 id: 布林}}")
    func encodesAsPlainDictionary() throws {
        var records = CheckRecords()
        records.toggle("water", on: day)
        records.toggle("morning", on: day)
        records.toggle("morning", on: day)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let json = try #require(String(data: try encoder.encode(records), encoding: .utf8))
        #expect(json == #"{"2026-10-01":{"morning":false,"water":true}}"#)
    }

    @Test("讀得回存檔格式")
    func decodesPlainDictionary() throws {
        let json = Data(#"{"2026-10-01":{"water":true,"protein":false}}"#.utf8)
        let records = try JSONDecoder().decode(CheckRecords.self, from: json)
        #expect(records.isChecked("water", on: day))
        #expect(!records.isChecked("protein", on: day))
        #expect(!records.isChecked("steps", on: day))
    }
}
