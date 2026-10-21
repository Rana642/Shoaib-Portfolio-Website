import sharp from "sharp";

const STORY_W = 1080;
const STORY_H = 1920;

type Rgb = { r: number; g: number; b: number };

const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/** The colour of a thin strip of rows (the post's own top or bottom edge) —
 *  only when that edge is one flat colour (a footer strip, a plain margin).
 *  A mixed edge (photo + white) would average to a muddy grey, so it gets
 *  clean white instead. */
async function edgeColour(image: Buffer, width: number, top: number, rows: number): Promise<Rgb> {
  const { channels } = await sharp(image).extract({ left: 0, top, width, height: rows }).stats();
  if (channels.slice(0, 3).some((c) => c.stdev > 14)) return WHITE;
  const [r, g, b] = channels.map((c) => Math.round(c.mean));
  return { r, g, b };
}

/**
 * A feed post (4:5, square, landscape…) as a full 9:16 Story frame: the
 * whole post, uncropped and centred, with the space above it filled in its
 * own top-edge colour and the space below in its bottom-edge colour (white
 * where an edge isn't one flat colour). Shared as-is, Instagram and Facebook zoom a 4:5 post to
 * fill the screen and cut its sides off — headline, footer contacts and all
 * (Meezab, 2026-10-21). A 4:5 post lands 285 px from the top and bottom,
 * clear of the Story's profile bar and reply box.
 */
export async function storyFrame(image: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(image)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(STORY_W, STORY_H, { fit: "inside" })
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const rows = Math.min(6, height);
  const [topColour, bottomColour] = await Promise.all([
    edgeColour(data, width, 0, rows),
    edgeColour(data, width, height - rows, rows),
  ]);

  const half = Math.floor(STORY_H / 2);
  const lower = await sharp({ create: { width: STORY_W, height: STORY_H - half, channels: 3, background: bottomColour } })
    .png()
    .toBuffer();
  return sharp({ create: { width: STORY_W, height: STORY_H, channels: 3, background: topColour } })
    .composite([
      { input: lower, top: half, left: 0 },
      { input: data, top: Math.floor((STORY_H - height) / 2), left: Math.floor((STORY_W - width) / 2) },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}
