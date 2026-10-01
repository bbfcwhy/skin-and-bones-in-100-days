import Foundation
import Testing

/// 計畫頁 JS 算出的逐日期望值，由 `mac/scripts/generate-plan-fixture.mjs` 產生。
struct PlanFixture: Decodable {
    struct Day: Decodable, CustomTestStringConvertible {
        let date: String
        let weekday: String
        let workoutLabel: String
        let workoutNote: String
        let strengthType: String?
        let dayType: String
        let calorieLabel: String
        let progressText: String

        var testDescription: String { date }
    }

    let source: String
    let scriptSha256: String
    let timeZone: String
    let days: [Day]

    static let shared: PlanFixture = {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("Fixtures/plan-fixture.json")
        // 讀不到就給空的 fixture，讓 PlanFixtureTests 清楚地紅，不要讓整個測試行程當掉。
        guard let data = try? Data(contentsOf: url),
              let fixture = try? JSONDecoder().decode(PlanFixture.self, from: data) else {
            return PlanFixture(source: url.path, scriptSha256: "", timeZone: "", days: [])
        }
        return fixture
    }()
}
