import SwiftUI

/// 浮動視窗的內容：今天的資訊、每日清單、本週圓點。
struct TodayView: View {
    let model: TodayModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            Divider()
            VStack(alignment: .leading, spacing: 2) {
                ForEach(model.items) { item in
                    ChecklistRow(item: item, isChecked: model.isChecked(item.id)) {
                        model.toggle(item.id)
                    }
                }
            }
            Divider()
            WeekRow(week: model.week, streak: model.streak)
            if let issue = model.storageIssue {
                Label(issue.message, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
        }
        .padding(.horizontal, 14)
        .padding(.top, 12)
        .padding(.bottom, 14)
        .frame(width: 280, alignment: .leading)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline) {
                Text("\(model.today.month)/\(model.today.day) \(model.today.weekdayName)")
                    .font(.headline)
                Spacer()
                Text(model.progressText)
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            Text("\(model.workout.label)・\(model.workout.note)")
                .font(.callout)
            Text("\(model.workout.dayType.calorieLabel)・\(model.workout.dayType.name)")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
    }
}

private struct ChecklistRow: View {
    let item: ChecklistItem
    let isChecked: Bool
    let toggle: () -> Void

    var body: some View {
        Button(action: toggle) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: isChecked ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isChecked ? Color.green : Color.secondary)
                    .font(.body)
                VStack(alignment: .leading, spacing: 1) {
                    Text(item.title)
                        .foregroundStyle(isChecked ? .secondary : .primary)
                    if let detail = item.detail {
                        Text(detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
            }
            .font(.callout)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.title)
        .accessibilityValue(isChecked ? "已完成" : "未完成")
    }
}

private struct WeekRow: View {
    let week: [WeekDay]
    let streak: Int

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            ForEach(week, id: \.date) { day in
                VStack(spacing: 3) {
                    Text(day.date.weekdayName.replacingOccurrences(of: "週", with: ""))
                        .font(.caption2.weight(day.isToday ? .bold : .regular))
                        .foregroundStyle(day.isToday ? .primary : .secondary)
                    Image(systemName: day.status.symbolName)
                        .foregroundStyle(day.status.color)
                        .font(.system(size: 13))
                }
                .frame(maxWidth: .infinity)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(day.date.weekdayName) \(day.status.accessibilityText)")
            }
            VStack(spacing: 1) {
                Text("\(streak)")
                    .font(.title3.weight(.semibold).monospacedDigit())
                Text("連續全勾")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .frame(width: 52)
        }
    }
}

private extension DayStatus {
    var symbolName: String {
        switch self {
        case .complete: return "circle.fill"
        case .partial: return "circle.lefthalf.filled"
        case .empty: return "circle"
        }
    }

    var color: Color {
        switch self {
        case .complete: return .green
        case .partial: return .orange
        case .empty: return .secondary
        }
    }

    var accessibilityText: String {
        switch self {
        case .complete: return "全勾"
        case .partial: return "部分"
        case .empty: return "沒勾"
        }
    }
}

extension StorageIssue {
    var message: String {
        switch self {
        case .unreadableBackedUp(let fileName):
            return "紀錄檔讀不懂，已另存成 \(fileName)，從空白開始記"
        case .unreadableNotSaving:
            return "紀錄檔讀不到，這次的勾選不會存檔"
        case .saveFailed:
            return "存檔失敗，剛才的勾選還沒寫進紀錄檔"
        }
    }
}
