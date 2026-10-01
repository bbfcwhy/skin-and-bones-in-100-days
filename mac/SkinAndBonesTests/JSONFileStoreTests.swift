import Foundation
import Testing

/// 存檔是系統邊界，用每個測試自己的暫存資料夾驗真實的檔案讀寫。
struct JSONFileStoreTests {
    private let day = LocalDate(2026, 10, 1)
    private let fileURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("SkinAndBonesTests-\(UUID().uuidString)")
        .appendingPathComponent("records/checks.json")

    private var store: JSONFileStore {
        JSONFileStore(fileURL: fileURL, now: { instant("2026-10-01T12:00:00+08:00") })
    }

    @Test("還沒有紀錄檔時讀到空的紀錄")
    func missingFileLoadsEmpty() throws {
        #expect(try store.load() == CheckRecords())
    }

    @Test("存了再讀回來一樣；資料夾不存在會自動建立；檔案是規格的格式")
    func roundTrip() throws {
        var records = CheckRecords()
        records.toggle("water", on: day)
        try store.save(records)
        #expect(try store.load() == records)

        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: fileURL)) as? [String: [String: Bool]]
        #expect(json == ["2026-10-01": ["water": true]])
    }

    @Test("讀不懂的紀錄檔先另存備份，原檔內容不動")
    func unreadableFileIsBackedUp() throws {
        let original = Data("這不是 JSON".utf8)
        try FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try original.write(to: fileURL)

        var backupURL: URL?
        do {
            _ = try store.load()
        } catch StoreError.unreadable(let backup) {
            backupURL = backup
        }

        let backup = try #require(backupURL)
        #expect(backup.deletingLastPathComponent() == fileURL.deletingLastPathComponent())
        #expect(backup != fileURL)
        #expect(try Data(contentsOf: backup) == original)
        #expect(try Data(contentsOf: fileURL) == original)
    }
}
