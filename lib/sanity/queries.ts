import { groq } from "next-sanity";

export const allPostsQuery = groq`
  *[_type == "post"] | order(publishedAt desc) {
    "slug": slug.current,
    title,
    excerpt,
    category,
    publishedAt,
    body,
    "coverImage": coverImage.asset->url
  }
`;

export const postBySlugQuery = groq`
  *[_type == "post" && slug.current == $slug][0] {
    "slug": slug.current,
    title,
    excerpt,
    category,
    publishedAt,
    body,
    "coverImage": coverImage.asset->url,
    faqs
  }
`;
