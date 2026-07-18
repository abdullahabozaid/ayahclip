import XCTest

final class AyahClipUITests: XCTestCase {
    @MainActor
    func testFirstRunJourney() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ayahclip.onboarding.complete", "false"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Quran clips, made calmly"].waitForExistence(timeout: 5))

        app.buttons["Continue"].tap()
        XCTAssertTrue(app.staticTexts["Start from media you own"].waitForExistence(timeout: 2))

        app.buttons["Continue"].tap()
        XCTAssertTrue(app.staticTexts["Design once, publish anywhere"].waitForExistence(timeout: 2))

        app.buttons["Create my first clip"].tap()
        XCTAssertTrue(app.staticTexts["Your saved clips will live here"].waitForExistence(timeout: 3))
    }

    @MainActor
    func testSettingsLinksAreReachable() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ayahclip.onboarding.complete", "true"]
        app.launch()

        let settingsTab = app.tabBars.buttons["Settings"]
        XCTAssertTrue(settingsTab.waitForExistence(timeout: 5))
        settingsTab.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.staticTexts["Private by design. Your imported media and projects stay on this device during the beta."].waitForExistence(timeout: 2))
        XCTAssertTrue(app.descendants(matching: .any)["settings-privacy-link"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["settings-terms-link"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["settings-support-link"].exists)
        XCTAssertTrue(app.staticTexts["AyahClip 0.1.0 (1) · TestFlight beta"].exists)
    }

    @MainActor
    func testEditorChromeIsCompactAndAccessible() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ayahclip.onboarding.complete", "true"]
        app.launch()

        let newClip = app.buttons["New Quran clip"]
        XCTAssertTrue(newClip.waitForExistence(timeout: 5))
        newClip.tap()

        XCTAssertTrue(app.buttons["Close editor"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Export"].exists)
        XCTAssertTrue(app.sliders["Timeline playhead"].exists)
        XCTAssertTrue(app.buttons["Edit"].exists)
        XCTAssertTrue(app.buttons["Text"].exists)
        XCTAssertTrue(app.buttons["Style"].exists)
        XCTAssertTrue(app.buttons["Media"].exists)

        let canvas = app.descendants(matching: .any)["editor-canvas"]
        XCTAssertTrue(canvas.exists)
        XCTAssertEqual(canvas.frame.width / canvas.frame.height, 9.0 / 16.0, accuracy: 0.02)

        let fullscreen = app.buttons["Open full-screen preview"]
        XCTAssertTrue(fullscreen.exists)
        fullscreen.tap()
        let fullscreenCanvas = app.descendants(matching: .any)["fullscreen-editor-canvas"]
        XCTAssertTrue(fullscreenCanvas.waitForExistence(timeout: 3))
        XCTAssertEqual(fullscreenCanvas.frame.width / fullscreenCanvas.frame.height, 9.0 / 16.0, accuracy: 0.02)
        XCTAssertTrue(app.buttons["Play full-screen preview"].exists)
        let fullscreenAttachment = XCTAttachment(screenshot: app.screenshot())
        fullscreenAttachment.name = "Full-screen editor preview"
        fullscreenAttachment.lifetime = .keepAlways
        add(fullscreenAttachment)
        app.buttons["Close full-screen preview"].tap()
        XCTAssertTrue(app.buttons["Export"].waitForExistence(timeout: 3))

        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Compact editor"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    func testStyleControlsOpenAsFocusedSheet() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ayahclip.onboarding.complete", "true"]
        app.launch()

        let newClip = app.buttons["New Quran clip"]
        XCTAssertTrue(newClip.waitForExistence(timeout: 5))
        newClip.tap()
        XCTAssertTrue(app.buttons["Style"].waitForExistence(timeout: 3))
        app.buttons["Style"].tap()

        XCTAssertTrue(app.buttons["Centered"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Side fade"].exists)
        XCTAssertTrue(app.buttons["Lower third"].exists)
        XCTAssertTrue(app.buttons["Soft glow"].exists)
        XCTAssertTrue(app.sliders["Overlay"].exists)

        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Focused style sheet"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    func testTimelineControlsAreFunctionalAndFocused() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ayahclip.onboarding.complete", "true"]
        app.launch()

        XCTAssertTrue(app.buttons["New Quran clip"].waitForExistence(timeout: 5))
        app.buttons["New Quran clip"].tap()
        XCTAssertTrue(app.buttons["Edit"].waitForExistence(timeout: 3))
        app.buttons["Edit"].tap()

        XCTAssertTrue(app.buttons["Split at playhead"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Move start earlier"].exists)
        XCTAssertTrue(app.buttons["Move end later"].exists)
        app.buttons["Split at playhead"].tap()
        XCTAssertTrue(app.staticTexts["Verse 2"].waitForExistence(timeout: 2))

        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Functional verse timeline"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    func testMultiSourceImportAndMediaGuidanceAreClear() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ayahclip.onboarding.complete", "true"]
        app.launch()

        XCTAssertTrue(app.buttons["New Quran clip"].waitForExistence(timeout: 5))
        app.buttons["New Quran clip"].tap()
        XCTAssertTrue(app.buttons["Media"].waitForExistence(timeout: 3))
        app.buttons["Media"].tap()
        XCTAssertTrue(app.staticTexts["No media attached"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Add media from the Import tab"].exists)
        app.buttons["Done"].tap()
        app.buttons["Close editor"].tap()

        let importTab = app.tabBars.buttons["Import"]
        XCTAssertTrue(importTab.waitForExistence(timeout: 3))
        importTab.tap()
        XCTAssertTrue(app.buttons["Choose videos, Select up to 8 original or B-roll clips"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Browse Files, Recitation audio plus B-roll videos"].exists)

        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Multi-source import"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
