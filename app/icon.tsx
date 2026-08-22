import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Matches the citrus-period accent used on the wordmark everywhere else
// (Nav, Footer, 404) — ink square, citrus dot.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#0F0F14",
          borderRadius: 7,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ width: 11, height: 11, borderRadius: "50%", background: "#EAB308" }} />
      </div>
    ),
    { ...size }
  );
}
