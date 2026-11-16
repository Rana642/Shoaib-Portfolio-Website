// The pure part of "which business is selected in the portal sidebar", so it is tested on its own.

export const ACTIVE_PROJECT_COOKIE = "portal_project";

export type PortalProject = { id: string; name: string };

/** The cookie's project if it is one of the person's own, otherwise their first; null when they have none. */
export function pickActive(projects: PortalProject[], cookieValue: string | undefined): PortalProject | null {
  return projects.find((p) => p.id === cookieValue) ?? projects[0] ?? null;
}
