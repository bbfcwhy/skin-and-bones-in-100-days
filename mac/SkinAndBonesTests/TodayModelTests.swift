import Foundation
import Testing

/// 存檔是系統邊界，測試用記憶體裡的假存檔，可以指定讀寫失敗。
private final class FakeStore: CheckRecordStore {
    var stored: CheckRecords
    var loadError: Error?
    var saveError: Error?
    private(set) var saveCount = 0

    init(_ stored: CheckRecords = CheckRecords()) {
        self.stored = stored
    }

    func load() throws -> CheckRecords {
        if let loadError { throw loadError }
        return stored
    }

    func save(_ records: CheckRecords) throws {
        if let saveError { throw saveError }
        stored = records
        saveCount += 1
    }
}

/// 時間也是系統邊界，測試自己撥時鐘。
private final class FakeClock {
    var now: Date

    init(_ text: String) {
        now = instant(text)
    }

    func set(_ text: String) {
        now = instant(text)
    }
}

@MainActor
struct TodayModelTests {
    private let october1 = LocalDate(2026, 10, 1)
    private let october2 = LocalDate(2026, 10, 2)

    private func makeModel(_ store: FakeStore, _ clock: FakeClock, calendar: Calendar = .taipei) -> TodayModel {
        TodayModel(store: store, calendar: calendar, now: { clock.now })
    }

    @Test("今天依注入的時間與時區判斷")
    func todayFollowsInjectedCalendar() {
        let clock = FakeClock("2026-10-01T00:30:00+08:00")
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        #expect(makeModel(FakeStore(), clock).today == october1)
        #expect(makeModel(FakeStore(), clock, calendar: utc).today == LocalDate(2026, 9, 30))
    }

    @Test("過午夜換成新的一天：清單清空，昨天的勾選留著")
    func midnightStartsFreshDay() {
        let store = FakeStore()
        let clock = FakeClock("2026-10-01T23:59:59+08:00")
        let model = makeModel(store, clock)
        model.toggle("water")
        model.toggle("protein")

        clock.set("2026-10-02T00:00:01+08:00")
        #expect(model.refreshToday())
        #expect(model.today == october2)
        #expect(model.items.allSatisfy { !model.isChecked($0.id) })
        #expect(model.records.isChecked("water", on: october1))
        #expect(model.records.isChecked("protein", on: october1))
        #expect(store.stored.isChecked("water", on: october1))
    }

    @Test("午夜前不換日")
    func noChangeBeforeMidnight() {
        let clock = FakeClock("2026-10-01T23:59:00+08:00")
        let model = makeModel(FakeStore(), clock)
        model.toggle("water")

        clock.set("2026-10-01T23:59:59+08:00")
        #expect(!model.refreshToday())
        #expect(model.today == october1)
        #expect(model.records.isChecked("water", on: model.today))
    }

    @Test("睡眠好幾天後喚醒，直接換到正確的日期")
    func wakeAfterSeveralDays() {
        let clock = FakeClock("2026-10-01T22:00:00+08:00")
        let model = makeModel(FakeStore(), clock)

        clock.set("2026-10-04T08:00:00+08:00")
        #expect(model.refreshToday())
        #expect(model.today == LocalDate(2026, 10, 4))
        #expect(model.items.count == 7)
    }

    @Test("系統時間改回前一天，顯示那一天的勾選")
    func clockSetBackShowsThatDay() {
        let store = FakeStore()
        let clock = FakeClock("2026-10-01T09:00:00+08:00")
        let model = makeModel(store, clock)
        model.toggle("water")

        clock.set("2026-10-02T09:00:00+08:00")
        model.refreshToday()
        #expect(!model.isChecked("water"))

        clock.set("2026-10-01T21:00:00+08:00")
        #expect(model.refreshToday())
        #expect(model.today == october1)
        #expect(model.isChecked("water"))
    }

    @Test("打勾馬上存檔，存在今天的日期底下")
    func toggleSavesImmediately() {
        let store = FakeStore()
        let model = makeModel(store, FakeClock("2026-10-01T09:00:00+08:00"))
        model.toggle("water")
        #expect(store.saveCount == 1)
        #expect(store.stored.isChecked("water", on: october1))
        model.toggle("water")
        #expect(store.saveCount == 2)
        #expect(!store.stored.isChecked("water", on: october1))
    }

    @Test("不在今天清單上的項目不能勾")
    func ignoresItemsNotOnTodaysList() {
        let store = FakeStore()
        let model = makeModel(store, FakeClock("2026-10-01T09:00:00+08:00"))
        model.toggle("waist")
        #expect(store.saveCount == 0)
        #expect(!model.records.isChecked("waist", on: october1))
    }

    @Test("開啟時讀到既有紀錄")
    func loadsExistingRecords() {
        var existing = CheckRecords()
        existing.toggle("water", on: october1)
        let model = makeModel(FakeStore(existing), FakeClock("2026-10-01T09:00:00+08:00"))
        #expect(model.records == existing)
        #expect(model.storageIssue == nil)
    }

    @Test("紀錄檔讀不懂：顯示已另存備份，之後照常存檔")
    func unreadableFileWithBackup() {
        let store = FakeStore()
        store.loadError = StoreError.unreadable(backup: URL(fileURLWithPath: "/tmp/checks.unreadable-1.json"))
        let model = makeModel(store, FakeClock("2026-10-01T09:00:00+08:00"))
        #expect(model.storageIssue == .unreadableBackedUp(fileName: "checks.unreadable-1.json"))
        model.toggle("water")
        #expect(store.saveCount == 1)
    }

    @Test("紀錄檔讀不到又沒備份：不存檔，避免蓋掉原檔")
    func unreadableFileWithoutBackupNeverSaves() {
        let store = FakeStore()
        store.loadError = CocoaError(.fileReadNoPermission)
        let model = makeModel(store, FakeClock("2026-10-01T09:00:00+08:00"))
        #expect(model.storageIssue == .unreadableNotSaving)
        model.toggle("water")
        #expect(model.records.isChecked("water", on: october1))
        #expect(store.saveCount == 0)
    }

    @Test("存檔失敗要看得到；下次存成功就消失，之前的勾選也一起存進去")
    func saveFailureIsVisibleAndRecovers() {
        let store = FakeStore()
        let model = makeModel(store, FakeClock("2026-10-01T09:00:00+08:00"))
        store.saveError = CocoaError(.fileWriteOutOfSpace)
        model.toggle("water")
        #expect(model.storageIssue == .saveFailed)

        store.saveError = nil
        model.toggle("protein")
        #expect(model.storageIssue == nil)
        #expect(store.stored.isChecked("water", on: october1))
        #expect(store.stored.isChecked("protein", on: october1))
    }

    @Test("打勾後本週圓點與連續天數馬上更新")
    func progressUpdatesImmediately() {
        let model = makeModel(FakeStore(), FakeClock("2026-10-01T09:00:00+08:00"))
        #expect(model.streak == 0)
        for item in model.items {
            model.toggle(item.id)
        }
        #expect(model.week.first { $0.isToday }?.status == .complete)
        #expect(model.streak == 1)
    }
}
