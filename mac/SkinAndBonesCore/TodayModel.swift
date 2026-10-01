import Foundation
import Observation

enum StorageIssue: Equatable {
    /// 紀錄檔讀不懂，原檔已另存成這個檔名，從空白開始記。
    case unreadableBackedUp(fileName: String)
    /// 紀錄檔讀不到也沒辦法備份，這次開啟期間都不存檔，避免蓋掉原檔。
    case unreadableNotSaving
    /// 最近一次存檔失敗，勾選只在記憶體裡。下次存成功就消失。
    case saveFailed
}

/// 視窗顯示的「今天」。時間、時區、存檔都從外面注入，測試不碰真實系統。
@MainActor
@Observable
final class TodayModel {
    private(set) var today: LocalDate
    private(set) var records: CheckRecords
    private(set) var storageIssue: StorageIssue?

    @ObservationIgnored private let store: CheckRecordStore
    @ObservationIgnored private let calendar: Calendar
    @ObservationIgnored private let now: () -> Date
    @ObservationIgnored private let canSave: Bool

    init(store: CheckRecordStore, calendar: Calendar = .autoupdatingCurrent, now: @escaping () -> Date = Date.init) {
        self.store = store
        self.calendar = calendar
        self.now = now
        today = LocalDate(now(), calendar: calendar)
        do {
            records = try store.load()
            canSave = true
        } catch StoreError.unreadable(let backup) {
            records = CheckRecords()
            storageIssue = .unreadableBackedUp(fileName: backup.lastPathComponent)
            canSave = true
        } catch {
            records = CheckRecords()
            storageIssue = .unreadableNotSaving
            canSave = false
        }
    }

    var items: [ChecklistItem] { Checklist.items(on: today) }

    var workout: Workout { PlanSchedule.workout(on: today) }

    var progressText: String { HundredDayPlan.progressText(on: today) }

    var week: [WeekDay] { DailyProgress.week(containing: today, records: records) }

    var streak: Int { DailyProgress.streak(today: today, records: records) }

    func isChecked(_ itemID: String) -> Bool {
        records.isChecked(itemID, on: today)
    }

    /// 重新判斷今天是哪一天。過午夜、睡眠喚醒、改系統時間後呼叫；換日回傳 true。
    /// 紀錄照日期存，換日只是換一天看，不清掉任何一天。
    @discardableResult
    func refreshToday() -> Bool {
        let current = LocalDate(now(), calendar: calendar)
        guard current != today else { return false }
        today = current
        return true
    }

    /// 勾選或取消畫面上這一天的項目，馬上存檔。
    func toggle(_ itemID: String) {
        guard items.contains(where: { $0.id == itemID }) else { return }
        records.toggle(itemID, on: today)
        guard canSave else { return }
        do {
            try store.save(records)
            if storageIssue == .saveFailed { storageIssue = nil }
        } catch {
            storageIssue = .saveFailed
        }
    }
}
