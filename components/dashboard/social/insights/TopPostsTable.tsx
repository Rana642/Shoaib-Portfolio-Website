import { ExternalLink, ImageOff } from "lucide-react";
import { formatNumber, formatDate } from "@/lib/dashboard/format";
import type { PostFormat, PostRow } from "@/lib/social-insights";

export const FORMAT_LABEL: Record<PostFormat, string> = { reel: "Reel", video: "Video", carousel: "Carousel", image: "Image" };

type Column = { key: "views" | "reach" | "reactions" | "comments" | "shares" | "extra"; label: string };

const COLUMNS: Record<"facebook" | "instagram", Column[]> = {
  facebook: [
    { key: "views", label: "Views" },
    { key: "reach", label: "Reach" },
    { key: "reactions", label: "Reactions" },
    { key: "comments", label: "Comments" },
    { key: "shares", label: "Shares" },
    { key: "extra", label: "Clicks" },
  ],
  instagram: [
    { key: "views", label: "Views" },
    { key: "reach", label: "Reach" },
    { key: "reactions", label: "Likes" },
    { key: "comments", label: "Comments" },
    { key: "shares", label: "Shares" },
    { key: "extra", label: "Saves" },
  ],
};

/** Rows shown before the "Show more" fold. */
const TOP = 10;

export default function TopPostsTable({ platform, posts }: { platform: "facebook" | "instagram"; posts: PostRow[] }) {
  if (posts.length === 0) return <p className="text-small text-ink-subtle">No posts published in this period.</p>;
  const rest = posts.slice(TOP);
  return (
    <>
      <PostsTable platform={platform} posts={posts.slice(0, TOP)} />
      {rest.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-small text-ink-muted hover:text-ink">
            Show {rest.length} more post{rest.length === 1 ? "" : "s"}
          </summary>
          <PostsTable platform={platform} posts={rest} />
        </details>
      )}
    </>
  );
}

function PostsTable({ platform, posts }: { platform: "facebook" | "instagram"; posts: PostRow[] }) {
  const cols = COLUMNS[platform];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-small">
        <thead>
          <tr className="border-b border-ink/10 text-ink-subtle">
            <th className="text-left font-medium py-2 pr-3">Post</th>
            {cols.map((c) => (
              <th key={c.key} className="text-right font-medium py-2 px-2 whitespace-nowrap">
                {c.label}
              </th>
            ))}
            <th className="py-2 pl-2">
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => (
            <tr key={p.id} className="border-b border-ink/5 last:border-0">
              <td className="py-2.5 pr-3">
                <div className="flex items-center gap-3 min-w-0">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" loading="lazy" className="size-12 rounded-lg object-cover shrink-0 bg-ink/5" />
                  ) : (
                    <div className="size-12 rounded-lg bg-ink/5 shrink-0 flex items-center justify-center">
                      <ImageOff className="size-4 text-ink-subtle" aria-hidden />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-tag text-ink-subtle">
                      {formatDate(p.date)}
                      {p.format && <span className="ml-2 uppercase tracking-wider">{FORMAT_LABEL[p.format]}</span>}
                    </p>
                    <p className="line-clamp-2 max-w-[28rem]">
                      {p.text || <span className="text-ink-subtle">No caption</span>}
                    </p>
                  </div>
                </div>
              </td>
              {cols.map((c) => (
                <td key={c.key} className="py-2.5 px-2 text-right tabular-nums">
                  {formatNumber(p[c.key])}
                  {c.key === "views" && p.adViews ? (
                    <span className="block text-tag text-ink-subtle whitespace-nowrap">+{formatNumber(p.adViews)} ads</span>
                  ) : null}
                </td>
              ))}
              <td className="py-2.5 pl-2 text-right">
                {p.url && (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Open post"
                    className="inline-flex text-ink-subtle hover:text-ink transition-colors"
                  >
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
