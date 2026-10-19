import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
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
        <svg width={112} height={112} viewBox="16.5 24.5 77 77" xmlns="http://www.w3.org/2000/svg">
          <path d="M33 92 V50 A22 22 0 0 1 77 50 V92" fill="none" stroke="#FFFFFF" strokeWidth="7" />
          <path d="M20 92 H90" fill="none" stroke="#FFFFFF" strokeWidth="7" />
          <circle cx="66" cy="70" r="4" fill="#8DA2F0" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
