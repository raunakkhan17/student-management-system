/** Public runtime configuration. Values must be inlined literally so Next can
 *  statically replace them in the client bundle. */
export const appConfig = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1',
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? 'EduCore',
} as const;
