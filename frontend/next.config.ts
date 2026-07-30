import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // A stray lockfile in the user profile makes Next infer the wrong workspace
  // root; pin it to this app so build traces stay correct.
  outputFileTracingRoot: path.join(__dirname),

  // React Compiler is disabled deliberately. Its Babel loader crashes Turbopack
  // on this environment (`evaluate_webpack_loader` panic), and Turbopack is the
  // Next 16 default for both `dev` and `build`. Components are memoized by hand
  // where profiling justifies it. Re-enable only if you also switch the build
  // to `next build --webpack`.
  reactCompiler: false,

  images: {
    // Uploaded files are streamed through the authenticated API, never
    // optimized from a public origin.
    remotePatterns: [],
  },
};

export default nextConfig;
