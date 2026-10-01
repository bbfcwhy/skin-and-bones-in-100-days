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
        do {
            return try JSONDecoder().decode(PlanFixture.self, from: Data(contentsOf: url))
        } catch {
            fatalError("讀不到 fixture：\(url.path)：\(error)")
        }
    }()
}
