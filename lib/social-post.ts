import "server-only";
import { listSocialAccountsForProject, decryptAccountToken } from "./social-accounts";
import { postFacebookPhoto, postInstagramPhoto } from "./social-fb";
import { postLinkedInPhoto } from "./social-linkedin";
import type { ClientSocialAccount } from "./dashboard/types";

export type PlatformPostResult = {
  platform: string;
  label: string;
  ok: boolean;
  post_id?: string;
  error?: string;
};

async function postToOneAccount(
  account: ClientSocialAccount,
  imageUrl: string,
  caption: string
): Promise<PlatformPostResult> {
  const token = decryptAccountToken(account);
  try {
    let post_id = "";
    if (account.platform === "facebook") {
      post_id = (await postFacebookPhoto(account.external_id, token, imageUrl, caption)).post_id;
    } else if (account.platform === "instagram") {
      post_id = (await postInstagramPhoto(account.external_id, token, imageUrl, caption)).post_id;
    } else if (account.platform === "linkedin") {
      post_id = (await postLinkedInPhoto(account.external_id, token, imageUrl, caption)).post_id;
    }
    return { platform: account.platform, label: account.label, ok: true, post_id };
  } catch (error) {
    return {
      platform: account.platform,
      label: account.label,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Posts to every active connected account for the project — no per-post
 *  platform selection (Shoaib's decision: one image goes everywhere that
 *  project is connected). */
export async function postToAllProjectAccounts(
  projectId: string,
  imageUrl: string,
  caption: string
): Promise<PlatformPostResult[]> {
  const accounts = await listSocialAccountsForProject(projectId);
  if (accounts.length === 0) {
    return [{ platform: "-", label: "-", ok: false, error: "This project has no connected social accounts." }];
  }
  return Promise.all(accounts.map((a) => postToOneAccount(a, imageUrl, caption)));
}
