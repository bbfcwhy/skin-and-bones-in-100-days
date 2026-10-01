import Foundation

protocol CheckRecordStore {
    func load() throws -> CheckRecords
    func save(_ records: CheckRecords) throws
}

enum StoreError: Error, Equatable {
    /// 紀錄檔的內容讀不懂。原檔已另存成 backup，之後覆寫原檔不會丟資料。
    case unreadable(backup: URL)
}

/// 把勾選紀錄存成一個 JSON 檔。
struct JSONFileStore: CheckRecordStore {
    let fileURL: URL
    var now: () -> Date = Date.init

    /// 沒有檔案回空的紀錄；讀不懂就先另存備份再丟 `StoreError.unreadable`；
    /// 其他讀取錯誤（例如沒有權限）照原樣丟出，呼叫端不能覆寫原檔。
    func load() throws -> CheckRecords {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return CheckRecords() }
        let data = try Data(contentsOf: fileURL)
        do {
            return try JSONDecoder().decode(CheckRecords.self, from: data)
        } catch {
            throw StoreError.unreadable(backup: try backUp(data))
        }
    }

    /// 整份寫進暫存檔再換名（atomic），寫到一半當機也不會留下半個檔案。
    func save(_ records: CheckRecords) throws {
        try FileManager.default.createDirectory(
            at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(records).write(to: fileURL, options: .atomic)
    }

    private func backUp(_ data: Data) throws -> URL {
        let stamp = Int(now().timeIntervalSince1970)
        let backup = fileURL.deletingLastPathComponent()
            .appendingPathComponent("\(fileURL.deletingPathExtension().lastPathComponent).unreadable-\(stamp).json")
        try data.write(to: backup, options: .withoutOverwriting)
        return backup
    }
}
