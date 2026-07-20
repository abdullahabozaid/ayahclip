import XCTest

final class AyahClipUITests: XCTestCase {
    @MainActor
    func testFirstRunJourneyOpensFullProduct() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ayahclip.onboarding.complete", "false"]
        app.launch()

        XCTAssertTrue(app.staticTexts["Quran clips, made calmly"].waitForExistence(timeout: 5))
        app.buttons["Continue"].tap()
        XCTAssertTrue(app.staticTexts["Start from media you own"].waitForExistence(timeout: 2))
        app.buttons["Continue"].tap()
        XCTAssertTrue(app.staticTexts["Design once, publish anywhere"].waitForExistence(timeout: 2))
        app.buttons["Create my first clip"].tap()

        XCTAssertTrue(app.webViews["ayahclip-product-webview"].waitForExistence(timeout: 12))
        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Craft luminous")
        ).firstMatch.waitForExistence(timeout: 8))
    }

    @MainActor
    func testQuranCreationJourneyReachesSurahPicker() throws {
        let app = launchReadyApp()
        XCTAssertTrue(app.webViews["ayahclip-product-webview"].waitForExistence(timeout: 12))

        let begin = app.links["Begin a clip"]
        XCTAssertTrue(begin.waitForExistence(timeout: 8))
        begin.tap()

        XCTAssertTrue(app.staticTexts["Choose a surah"].waitForExistence(timeout: 12))
        XCTAssertTrue(app.textFields["Search surahs by name or number"].exists)
    }

    @MainActor
    func testImportJourneyReachesRealMediaPicker() throws {
        let app = launchReadyApp()
        XCTAssertTrue(app.webViews["ayahclip-product-webview"].waitForExistence(timeout: 12))

        let importAudio = app.links["Import audio"]
        XCTAssertTrue(importAudio.waitForExistence(timeout: 8))
        importAudio.tap()

        XCTAssertTrue(app.staticTexts.matching(
            NSPredicate(format: "label CONTAINS %@", "Upload permitted audio or video")
        ).firstMatch.waitForExistence(timeout: 12))
        let mediaPicker = app.buttons.matching(
            NSPredicate(format: "label CONTAINS %@", "Choose audio or video")
        ).firstMatch
        XCTAssertTrue(mediaPicker.exists)
        mediaPicker.tap()
        let photoLibrary = app.buttons["Photo Library"]
        let chooseFile = app.buttons["Choose File"]
        let photosNavigation = app.navigationBars["Photos"]
        XCTAssertTrue(
            photoLibrary.waitForExistence(timeout: 3)
                || chooseFile.waitForExistence(timeout: 3)
                || photosNavigation.waitForExistence(timeout: 3),
            "The web import control must open an iOS media source picker."
        )
    }

    @MainActor
    func testWatermarkCleanupRequiresRightsConfirmation() throws {
        let app = launchReadyApp()
        let cleanup = app.buttons["Clean watermark"]
        XCTAssertTrue(cleanup.waitForExistence(timeout: 12))
        cleanup.tap()

        XCTAssertTrue(app.staticTexts["Clean an owned video"].waitForExistence(timeout: 3))
        let chooser = app.buttons["Choose a video"]
        XCTAssertTrue(chooser.exists)
        XCTAssertFalse(chooser.isEnabled)
        app.switches["I own this video or have permission to edit it"].tap()
        XCTAssertTrue(chooser.isEnabled)
    }

    @MainActor
    private func launchReadyApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-ayahclip.onboarding.complete", "true"]
        app.launch()
        return app
    }
}
