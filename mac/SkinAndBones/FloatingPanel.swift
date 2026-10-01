import AppKit
import SwiftUI

/// 浮在所有視窗上面的半透明小視窗。點它不會把正在用的 App 切走：
/// 不能成為 key window，第一下點擊直接交給按鈕。
final class FloatingPanel: NSPanel {
    private static let autosaveName = "TodayPanel"

    init<Content: View>(content: Content) {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 280, height: 400),
            styleMask: [.titled, .fullSizeContentView, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        isFloatingPanel = true
        level = .floating
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle]
        hidesOnDeactivate = false
        isMovableByWindowBackground = true
        isReleasedWhenClosed = false
        titleVisibility = .hidden
        titlebarAppearsTransparent = true
        for button in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
            standardWindowButton(button)?.isHidden = true
        }
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true

        let background = NSVisualEffectView()
        background.material = .popover
        background.blendingMode = .behindWindow
        background.state = .active
        let hosting = FirstMouseHostingView(rootView: content)
        // 標題列是透明的，內容直接畫到最上面；頂端那一條同時是拖動視窗的把手。
        hosting.safeAreaRegions = []
        hosting.translatesAutoresizingMaskIntoConstraints = false
        background.addSubview(hosting)
        NSLayoutConstraint.activate([
            hosting.leadingAnchor.constraint(equalTo: background.leadingAnchor),
            hosting.trailingAnchor.constraint(equalTo: background.trailingAnchor),
            hosting.topAnchor.constraint(equalTo: background.topAnchor),
            hosting.bottomAnchor.constraint(equalTo: background.bottomAnchor)
        ])
        contentView = background
        // 視窗大小跟著內容走（週日多一項會變高），一開始就先貼合。
        setContentSize(hosting.fittingSize)
    }

    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }

    /// 回到上次的位置；第一次開，或上次的位置已經不在任何螢幕上，就放到主螢幕右上角。
    func restorePosition() {
        let restored = setFrameUsingName(Self.autosaveName)
        setFrameAutosaveName(Self.autosaveName)
        // 標題列（拖動的把手）中間那一點要在某個螢幕上，不然拖不回來。
        let handle = NSPoint(x: frame.midX, y: frame.maxY - 10)
        let onScreen = NSScreen.screens.contains { $0.visibleFrame.contains(handle) }
        if !restored || !onScreen {
            placeAtTopRight()
        }
    }

    private func placeAtTopRight() {
        guard let visible = NSScreen.main?.visibleFrame else { return }
        let margin: CGFloat = 16
        setFrameTopLeftPoint(NSPoint(x: visible.maxX - frame.width - margin, y: visible.maxY - margin))
    }
}

/// 視窗不是 key window 時，第一下點擊也直接交給按鈕，不用先點一下「啟用」視窗。
private final class FirstMouseHostingView<Content: View>: NSHostingView<Content> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}
