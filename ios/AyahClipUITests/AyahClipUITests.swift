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
        XCTAssertTrue(app.buttons["New Quran clip"].waitForExistence(timeout: 3))
    }

    @MainActor
    func testSharedStudioReplacesLegacyEditor() throws {
        let app = launchReadyApp()
        let newClip = app.buttons["New Quran clip"]
        XCTAssertTrue(newClip.waitForExistence(timeout: 5))
        newClip.tap()

        XCTAssertTrue(app.buttons["Close editor"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.webViews["shared-studio-webview"].exists)
        XCTAssertFalse(app.buttons["Style"].exists, "The legacy prototype editor must not be mounted")

        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = "Shared mobile Studio"
        attachment.lifetime = .keepAlways
        add(attachment)

        app.buttons["Close editor"].tap()
        XCTAssertTrue(app.buttons["New Quran clip"].waitForExistence(timeout: 3))
    }

    @MainActor
    func testImportOffersOwnedMediaAndWatermarkCleanup() throws {
        let app = launchReadyApp()
        app.tabBars.buttons["Import"].tap()

        XCTAssertTrue(app.buttons[
            "Choose photos or videos, Select up to 8 original visuals or B-roll items"
        ].waitForExistence(timeout: 3))
        XCTAssertTrue(app.buttons["Browse Files, Recitation audio, photos, and videos"].exists)
        let cleanup = app.buttons[
            "Clean a watermark, For videos you own · processed on device"
        ]
        XCTAssertTrue(cleanup.exists)
        cleanup.tap()

        XCTAssertTrue(app.buttons["I own it or have permission"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Only edit media you own")
        ).firstMatch.exists)
    }

    @MainActor
    func testSettingsLinksAreReachable() throws {
        let app = launchReadyApp()
        app.tabBars.buttons["Settings"].tap()

        XCTAssertTrue(app.staticTexts[
            "Private by design. Your imported media and projects stay on this device during the beta."
        ].waitForExistence(timeout: 2))
        XCTAssertTrue(app.descendants(matching: .any)["settings-privacy-link"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["settings-terms-link"].exists)
        XCTAssertTrue(app.descendants(matching: .any)["settings-support-link"].exists)
    }

    @MainActor
    private func launchReadyApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-ayahclip.onboarding.complete", "true"]
        app.launch()
        return app
    }
}
