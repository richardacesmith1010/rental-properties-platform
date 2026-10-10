import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAP_SERVER_URL ?? "https://domusbase.com/login";
const parsed = new URL(serverUrl);
const localHttp = serverUrl.startsWith("http://") && ["localhost", "127.0.0.1"].includes(parsed.hostname);
if (
  (!serverUrl.startsWith("https://") && !localHttp) || parsed.username || parsed.password
  || serverUrl !== serverUrl.trim() || serverUrl.includes("\\")
) {
  throw new Error("CAP_SERVER_URL must use HTTPS or HTTP localhost/127.0.0.1, without credentials.");
}

const config: CapacitorConfig = {
  appId: "com.domusbase.app",
  appName: "Domus",
  webDir: "www",
  server: {
    url: serverUrl,
    cleartext: false,
    errorPath: "offline.html",
    allowNavigation: ["domusbase.com", "checkout.stripe.com", "hooks.stripe.com", "pay.stripe.com"]
  },
  ios: {
    contentInset: "never",
    appendUserAgent: "DomusApp/1",
    limitsNavigationsToAppBoundDomains: false
  },
  plugins: {
    SplashScreen: { launchAutoHide: true, launchShowDuration: 1500, backgroundColor: "#FFFFFF" },
    StatusBar: { overlaysWebView: true, style: "DEFAULT" }
  }
};

export default config;
