/// 每天的勾選結果。存檔格式是 `{"YYYY-MM-DD": {"項目id": true}}`，取消勾選存 false，不刪任何一天。
struct CheckRecords: Equatable {
    private(set) var days: [String: [String: Bool]]

    init(days: [String: [String: Bool]] = [:]) {
        self.days = days
    }

    func isChecked(_ itemID: String, on date: LocalDate) -> Bool {
        days[date.key]?[itemID] == true
    }

    mutating func toggle(_ itemID: String, on date: LocalDate) {
        days[date.key, default: [:]][itemID] = !isChecked(itemID, on: date)
    }
}

extension CheckRecords: Codable {
    init(from decoder: Decoder) throws {
        days = try decoder.singleValueContainer().decode([String: [String: Bool]].self)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(days)
    }
}
