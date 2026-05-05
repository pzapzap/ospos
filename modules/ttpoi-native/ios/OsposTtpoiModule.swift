import ExpoModulesCore
import ProximityReader
import UIKit

public class OsposTtpoiModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OsposTtpoi")

    // Synchronous probe the JS layer calls on mount to decide which education
    // UI to render. True only on iOS 18+, where Apple's ProximityReaderDiscovery
    // provides an Apple-authored, pre-approved merchant education overlay.
    Function("isAppleEducationSupported") { () -> Bool in
      if #available(iOS 18.0, *) { return true }
      return false
    }

    // Presents Apple's ProximityReaderDiscovery "How to Tap" overlay.
    // This satisfies Apple's TTPOi Entitlement requirements 4.3, 4.4, 4.5:
    //   - 4.3 marketing-approved visuals (Apple ships the content)
    //   - 4.4 how to accept contactless cards
    //   - 4.5 how to accept Apple Pay + digital wallets
    //
    // The promise resolves as soon as the overlay is presented; dismissal is
    // handled by the system UI ("Done" button). JS code should render its
    // "Continue" screen behind it.
    AsyncFunction("showHowToTap") { (promise: Promise) in
      guard #available(iOS 18.0, *) else {
        promise.reject("E_UNSUPPORTED", "Apple merchant education requires iOS 18 or later.")
        return
      }
      Task { @MainActor in
        do {
          guard let topVC = Self.topViewController() else {
            promise.reject("E_NO_VC", "Unable to locate a view controller to present from.")
            return
          }
          let discovery = ProximityReaderDiscovery()
          let content = try await discovery.content(for: .payment(.howToTap))
          try await discovery.presentContent(content, from: topVC)
          promise.resolve(nil)
        } catch {
          promise.reject("E_PRESENT_FAILED", error.localizedDescription)
        }
      }
    }
  }

  @MainActor
  private static func topViewController() -> UIViewController? {
    guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive }),
          let rootVC = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
    else { return nil }
    var top = rootVC
    while let presented = top.presentedViewController {
      top = presented
    }
    return top
  }
}
