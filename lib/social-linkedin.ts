import "server-only";

/**
 * LinkedIn's v2 API — unlike Meta, it can't just take an image URL: the
 * image has to be registered, then the raw bytes PUT to a one-time upload
 * URL, before a UGC post can reference the resulting asset URN. Untested
 * against a real LinkedIn app/token as of writing (no client has connected
 * LinkedIn yet) — built to the documented v2 flow; revisit if the first
 * real post errors.
 */

const API_BASE = "https://api.linkedin.com/v2";

async function linkedinFetch(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LinkedIn API error (HTTP ${res.status}): ${text.slice(0, 300)}`);
  }
  return res;
}

export type DiscoveredOrganization = {
  organization_urn: string;
  name: string;
};

/** Lists Company Pages the token's owner administers — same idea as Meta's
 *  /me/accounts, so Shoaib can connect his own LinkedIn login once and see
 *  every client Page he's an admin on, instead of per-client OAuth.
 *
 *  NOTE: unlike Meta's self-serve Development Mode, this needs LinkedIn's
 *  Marketing Developer Platform product approval on the app (for the
 *  r_organization_admin and w_organization_social scopes) — LinkedIn
 *  reviews that manually, it isn't automatic. Until it's approved, this
 *  call will fail with a permissions error; the dashboard's manual
 *  LinkedIn/Instagram form is the fallback until then. */
export async function listManagedOrganizations(token: string): Promise<DiscoveredOrganization[]> {
  const res = await linkedinFetch(
    "/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(localizedName),organization))",
    token
  );
  const body = (await res.json()) as {
    elements: { organization: string; "organization~": { localizedName: string } }[];
  };
  return body.elements.map((el) => ({
    organization_urn: el.organization,
    name: el["organization~"]?.localizedName ?? el.organization,
  }));
}

/** authorUrn: "urn:li:person:xxxx" or "urn:li:organization:xxxx". */
export async function postLinkedInPhoto(
  authorUrn: string,
  token: string,
  imageUrl: string,
  caption: string
): Promise<{ post_id: string }> {
  // 1. Register the upload.
  const registerRes = await linkedinFetch("/assets?action=registerUpload", token, {
    method: "POST",
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
        owner: authorUrn,
        serviceRelationships: [
          { relationshipType: "OWNER", identifier: "urn:li:userGeneratedContent" },
        ],
      },
    }),
  });
  const registerBody = (await registerRes.json()) as {
    value: {
      asset: string;
      uploadMechanism: {
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": { uploadUrl: string };
      };
    };
  };
  const asset = registerBody.value.asset;
  const uploadUrl =
    registerBody.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl;

  // 2. Fetch the image bytes (from our R2 presigned URL) and PUT them to LinkedIn.
  const imageRes = await fetch(imageUrl);
  if (!imageRes.ok) throw new Error(`Could not fetch image for LinkedIn upload (HTTP ${imageRes.status})`);
  const imageBytes = await imageRes.arrayBuffer();
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: imageBytes,
  });
  if (!putRes.ok) throw new Error(`LinkedIn image upload failed (HTTP ${putRes.status})`);

  // 3. Create the post referencing the uploaded asset.
  const postRes = await linkedinFetch("/ugcPosts", token, {
    method: "POST",
    body: JSON.stringify({
      author: authorUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: caption },
          shareMediaCategory: "IMAGE",
          media: [{ status: "READY", media: asset }],
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    }),
  });
  const postId = postRes.headers.get("x-restli-id") || "";
  return { post_id: postId };
}
