import SwiftUI

enum AyahTheme {
    static let ink = Color(red: 0.031, green: 0.035, blue: 0.051)
    static let inkDeep = Color(red: 0.020, green: 0.020, blue: 0.027)
    static let surface = Color(red: 0.063, green: 0.071, blue: 0.102)
    static let surfaceRaised = Color(red: 0.090, green: 0.102, blue: 0.141)
    static let gold = Color(red: 0.788, green: 0.635, blue: 0.294)
    static let goldSoft = Color(red: 0.878, green: 0.753, blue: 0.455)
    static let parchment = Color(red: 0.925, green: 0.906, blue: 0.855)
    static let muted = Color(red: 0.663, green: 0.678, blue: 0.741)
    static let hairline = gold.opacity(0.18)

    static let background = LinearGradient(
        colors: [gold.opacity(0.07), .clear, ink],
        startPoint: .top,
        endPoint: .center
    )
}

extension View {
    func ayahPanel(radius: CGFloat = 18) -> some View {
        background(AyahTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .stroke(AyahTheme.parchment.opacity(0.08), lineWidth: 1)
            }
    }
}

