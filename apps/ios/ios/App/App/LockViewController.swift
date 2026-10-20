import UIKit

@MainActor
final class LockViewController: UIViewController {
    static let action = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 242 / 255, green: 243 / 255, blue: 245 / 255, alpha: 1)
            : UIColor(red: 11 / 255, green: 12 / 255, blue: 14 / 255, alpha: 1)
    }
    static let actionText = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 11 / 255, green: 12 / 255, blue: 14 / 255, alpha: 1)
            : .white
    }
    static let ground = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 14 / 255, green: 15 / 255, blue: 17 / 255, alpha: 1)
            : UIColor(red: 243 / 255, green: 244 / 255, blue: 246 / 255, alpha: 1)
    }
    static let ink = action
    static let link = UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 141 / 255, green: 162 / 255, blue: 240 / 255, alpha: 1)
            : UIColor(red: 36 / 255, green: 66 / 255, blue: 184 / 255, alpha: 1)
    }

    static func titleFont(compatibleWith traits: UITraitCollection?) -> UIFont {
        let base = UIFont.preferredFont(forTextStyle: .title1,
                                        compatibleWith: UITraitCollection(preferredContentSizeCategory: .large))
        if let descriptor = base.fontDescriptor.withDesign(.serif)?.withSymbolicTraits(.traitBold) {
            return UIFontMetrics(forTextStyle: .title1).scaledFont(
                for: UIFont(descriptor: descriptor, size: base.pointSize), compatibleWith: traits)
        }
        let preferred = UIFont.preferredFont(forTextStyle: .title1, compatibleWith: traits)
        let bold = preferred.fontDescriptor.withSymbolicTraits(.traitBold)
            ?? UIFont.boldSystemFont(ofSize: preferred.pointSize).fontDescriptor
        return UIFont(descriptor: bold, size: preferred.pointSize)
    }

    var unlock: (() -> Void)?
    var password: (() -> Void)?
    private let primary = UIButton(type: .system)
    private let fallback = UIButton(type: .system)
    private let message = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = Self.ground
        view.isOpaque = true
        view.accessibilityViewIsModal = true
        let icon = UIImageView(image: UIImage(named: "AppIcon60x60"))
        icon.contentMode = .scaleAspectFit
        icon.isAccessibilityElement = false
        icon.layer.cornerRadius = 18
        icon.layer.cornerCurve = .continuous
        icon.clipsToBounds = true
        let iconContainer = UIView()
        icon.translatesAutoresizingMaskIntoConstraints = false
        iconContainer.addSubview(icon)
        NSLayoutConstraint.activate([
            icon.widthAnchor.constraint(equalToConstant: 80), icon.heightAnchor.constraint(equalToConstant: 80),
            icon.centerXAnchor.constraint(equalTo: iconContainer.centerXAnchor),
            icon.topAnchor.constraint(equalTo: iconContainer.topAnchor),
            icon.bottomAnchor.constraint(equalTo: iconContainer.bottomAnchor)
        ])
        let title = UILabel()
        title.text = "Domus is locked"
        title.textColor = Self.ink
        title.font = Self.titleFont(compatibleWith: traitCollection)
        title.adjustsFontForContentSizeCategory = true
        title.numberOfLines = 0
        title.textAlignment = .center
        var primaryStyle = UIButton.Configuration.filled()
        primaryStyle.baseBackgroundColor = Self.action
        primaryStyle.baseForegroundColor = Self.actionText
        primaryStyle.cornerStyle = .fixed
        primaryStyle.background.cornerRadius = 4
        primary.configuration = primaryStyle
        primary.heightAnchor.constraint(greaterThanOrEqualToConstant: 50).isActive = true
        primary.addTarget(self, action: #selector(openTapped), for: .touchUpInside)
        var fallbackStyle = UIButton.Configuration.plain()
        fallbackStyle.baseForegroundColor = Self.link
        fallback.configuration = fallbackStyle
        fallback.setTitle("Sign in with password", for: .normal)
        fallback.addTarget(self, action: #selector(passwordTapped), for: .touchUpInside)
        for button in [primary, fallback] {
            button.titleLabel?.font = .preferredFont(forTextStyle: .headline)
            button.titleLabel?.adjustsFontForContentSizeCategory = true
            button.titleLabel?.numberOfLines = 0
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        }
        message.font = .preferredFont(forTextStyle: .body)
        message.adjustsFontForContentSizeCategory = true
        message.numberOfLines = 0
        message.textAlignment = .center
        message.isAccessibilityElement = true
        message.accessibilityTraits.insert(.updatesFrequently)
        let stack = UIStackView(arrangedSubviews: [iconContainer, title, primary, fallback, message])
        stack.axis = .vertical
        stack.spacing = 24
        // A scroll view keeps every action reachable at the largest Dynamic Type sizes.
        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        scroll.addSubview(stack)
        let center = stack.centerYAnchor.constraint(equalTo: scroll.frameLayoutGuide.centerYAnchor)
        center.priority = .defaultLow
        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor), scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            stack.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(greaterThanOrEqualTo: scroll.contentLayoutGuide.topAnchor, constant: 24),
            stack.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -24),
            stack.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -48), center
        ])
    }

    func display(cover: Bool, busy: Bool, kind: BiometricKind) {
        loadViewIfNeeded()
        primary.setTitle("Open with \(kind.title)", for: .normal)
        primary.isHidden = cover
        fallback.isHidden = cover
        message.isHidden = cover
        primary.isEnabled = !busy
        fallback.isEnabled = !busy
    }

    func showMessage(_ text: String?) {
        message.text = text
        if let text { UIAccessibility.post(notification: .announcement, argument: text) }
    }

    @objc private func openTapped() { unlock?() }
    @objc private func passwordTapped() { password?() }
}
