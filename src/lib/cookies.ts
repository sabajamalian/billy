import { cookies } from "next/headers";

const HOST_TOKEN_PREFIX = "billy_host_";

const hostTokenCookieName = (billId: string) => `${HOST_TOKEN_PREFIX}${billId}`;

const baseCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** Read the host token cookie for a specific bill. */
export const readHostTokenCookie = async (billId: string): Promise<string | undefined> => {
  const store = await cookies();
  return store.get(hostTokenCookieName(billId))?.value;
};

/** Set the host token cookie for a bill (only callable in route handlers / server actions). */
export const setHostTokenCookie = async (
  billId: string,
  token: string,
  expiresAt: Date,
): Promise<void> => {
  const store = await cookies();
  store.set(hostTokenCookieName(billId), token, {
    ...baseCookieOptions,
    expires: expiresAt,
  });
};

export const clearHostTokenCookie = async (billId: string): Promise<void> => {
  const store = await cookies();
  store.delete(hostTokenCookieName(billId));
};
