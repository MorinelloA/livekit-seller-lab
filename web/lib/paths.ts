/** The lab is served under this path, locally and on tonyt908.com. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** A path for fetch() and audio files, which don't add the base path themselves. Links do. */
export const withBase = (path: string) => `${BASE_PATH}${path}`;
