/// 週課表與熱量，移植自 vault 計畫頁的 getWorkoutForDate、getWeeklyOverview、getNutritionTargets。
/// 8/10 到 8/16 富士山半馬週的特例沒有移植：App 從 10/1 開始用，用不到。
enum PlanSchedule {
    /// A/B 輪替的起算週：2026-08-10 那週是 A-B-A 週，之後 B-A-B 週與 A-B-A 週交替。
    static let anchorMonday = LocalDate(2026, 8, 10)

    static func workout(on date: LocalDate) -> Workout {
        let weeksSinceAnchor = date.mondayOfWeek.days(since: anchorMonday) / 7
        let isABAWeek = weeksSinceAnchor % 2 == 0
        switch date.weekdayIndex {
        case 0, 4: return .strength(isABAWeek ? .a : .b)
        case 2: return .strength(isABAWeek ? .b : .a)
        case 1: return .intervalCardio
        case 5: return .longRunOrHIIT
        default: return .recoveryYoga
        }
    }
}

enum StrengthType: String {
    case a = "A"
    case b = "B"
}

enum Workout: Equatable {
    case strength(StrengthType)
    case intervalCardio
    case longRunOrHIIT
    case recoveryYoga

    var strengthType: StrengthType? {
        if case .strength(let type) = self { return type }
        return nil
    }

    var label: String {
        switch self {
        case .strength(let type): return "肌力 \(type.rawValue)"
        case .intervalCardio: return "間歇有氧"
        case .longRunOrHIIT: return "長跑或 HIIT"
        case .recoveryYoga: return "恢復瑜伽"
        }
    }

    var note: String {
        switch self {
        case .strength: return "約 50 到 60 分鐘"
        case .intervalCardio: return "衝 30 秒、慢走 90 秒，6 到 10 輪"
        case .longRunOrHIIT: return "長跑 7 到 10 km，或 HIIT 20 到 30 分鐘"
        case .recoveryYoga: return "30 分鐘低強度恢復"
        }
    }

    var dayType: DayType {
        switch self {
        case .strength: return .strength
        case .intervalCardio, .longRunOrHIIT: return .runOrHIIT
        case .recoveryYoga: return .recovery
        }
    }
}

enum DayType {
    case strength
    case runOrHIIT
    case recovery

    var name: String {
        switch self {
        case .strength: return "肌力日"
        case .runOrHIIT: return "跑步／HIIT 日"
        case .recovery: return "瑜伽／恢復日"
        }
    }

    var calorieLabel: String {
        switch self {
        case .strength: return "1,950 kcal"
        case .runOrHIIT: return "2,050 kcal"
        case .recovery: return "1,850 kcal"
        }
    }
}

extension LocalDate {
    private static let weekdayNames = ["週一", "週二", "週三", "週四", "週五", "週六", "週日"]

    var weekdayName: String {
        Self.weekdayNames[weekdayIndex]
    }
}
