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
          background: "#020617",
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
              background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
              borderRadius: 28,
              display: "flex",
              height: 128,
              justifyContent: "center",
              width: 128,
            }}
          >
            <span
              style={{
                color: "#ffffff",
                fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
                fontSize: 82,
                fontWeight: 800,
                lineHeight: 1,
              }}
            >
              D
            </span>
          </div>
          <div
            style={{
              color: "#ffffff",
              display: "flex",
              flexDirection: "column",
              fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 64, fontWeight: 700, letterSpacing: -1.2 }}>
              Domus — Rental Operations Platform
            </span>
            <span style={{ color: "#a5b4fc", fontSize: 34, fontWeight: 500 }}>
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
