import UIKit

@MainActor
final class LockViewController: UIViewController {
    var unlock: (() -> Void)?
    var password: (() -> Void)?
    private let primary = UIButton(type: .system)
    private let fallback = UIButton(type: .system)
    private let message = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        view.isOpaque = true
        view.accessibilityViewIsModal = true
        let icon = UIImageView(image: UIImage(named: "AppIcon60x60"))
        icon.contentMode = .scaleAspectFit
        icon.isAccessibilityElement = false
        icon.heightAnchor.constraint(equalToConstant: 80).isActive = true
        let title = UILabel()
        title.text = "Domus is locked"
        title.font = .preferredFont(forTextStyle: .title1)
        title.adjustsFontForContentSizeCategory = true
        title.numberOfLines = 0
        title.textAlignment = .center
        primary.configuration = .filled()
        primary.addTarget(self, action: #selector(openTapped), for: .touchUpInside)
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
        let stack = UIStackView(arrangedSubviews: [icon, title, primary, fallback, message])
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
