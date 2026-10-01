struct ChecklistItem: Equatable, Identifiable {
    /// 存進紀錄檔的鍵。改了會讓舊紀錄對不上，不要改。
    let id: String
    let title: String
    var detail: String?
}

/// 每日清單，照規格 3.3。
enum Checklist {
    static func items(on date: LocalDate) -> [ChecklistItem] {
        var items = [
            ChecklistItem(id: "morning", title: "起床量晨重，喝 700 ml 水配肌酸"),
            ChecklistItem(id: "protein", title: "蛋白質吃到 140 到 150 g"),
            ChecklistItem(id: "water", title: "3 杯水喝完，共 2.1 L"),
            ChecklistItem(id: "steps", title: "走滿 10,000 步", detail: "復職後平日至少 8,000"),
            ChecklistItem(id: "workout", title: "今天的運動做完：\(PlanSchedule.workout(on: date).label)"),
            ChecklistItem(id: "last-bite", title: "20:00 前吃完最後一口")
        ]
        if date.weekdayIndex == 6 {
            items.append(ChecklistItem(id: "waist", title: "量腰圍"))
        }
        return items
    }
}
