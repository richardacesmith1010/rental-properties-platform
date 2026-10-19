import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";
export const alt = "Domus — Rental Operations Platform";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#0B0C0E",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flexDirection: "column",
            gap: 28,
            textAlign: "center",
          }}
        >
          <div
            style={{
              alignItems: "center",
              background: "#0B0C0E",
              borderRadius: 28,
              display: "flex",
              height: 128,
              justifyContent: "center",
              width: 128,
            }}
          >
            <svg width={80} height={80} viewBox="16.5 24.5 77 77" xmlns="http://www.w3.org/2000/svg">
              <path d="M33 92 V50 A22 22 0 0 1 77 50 V92" fill="none" stroke="#FFFFFF" strokeWidth="7" />
              <path d="M20 92 H90" fill="none" stroke="#FFFFFF" strokeWidth="7" />
              <circle cx="66" cy="70" r="4" fill="#8DA2F0" />
            </svg>
          </div>
          <div
            style={{
              color: "#FFFFFF",
              display: "flex",
              flexDirection: "column",
              fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 64, fontWeight: 700, letterSpacing: -1.2 }}>
              Domus — Rental Operations Platform
            </span>
            <span style={{ color: "#A5ABB4", fontSize: 34, fontWeight: 500 }}>
              Run your rental portfolio with confidence.
            </span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
