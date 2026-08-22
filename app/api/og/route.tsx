import { ImageResponse } from "next/og";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title") ?? "Ads by Shoaib";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          backgroundColor: "#FAFAFA",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "#EAB308",
            }}
          />
          <span
            style={{
              fontSize: 22,
              fontFamily: "monospace",
              textTransform: "uppercase",
              letterSpacing: 4,
              color: "rgba(15,15,20,0.5)",
            }}
          >
            Ads by Shoaib
          </span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontStyle: "italic",
            lineHeight: 1.15,
            color: "#0F0F14",
            maxWidth: 980,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 24,
            color: "rgba(15,15,20,0.6)",
            fontFamily: "monospace",
          }}
        >
          Shoaib Nabi Noor · Performance Marketing
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
