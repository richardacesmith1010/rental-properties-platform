import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

export default function Icon() {
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
        <svg width={20} height={20} viewBox="16.5 24.5 77 77" xmlns="http://www.w3.org/2000/svg">
          <path d="M33 92 V50 A22 22 0 0 1 77 50 V92" fill="none" stroke="#FFFFFF" strokeWidth="7" />
          <path d="M20 92 H90" fill="none" stroke="#FFFFFF" strokeWidth="7" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
