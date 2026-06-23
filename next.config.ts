import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // potrace + jimp are Node-native image libs; the bundler mangles their classes
  // ("instanceof is not callable"). Load them via native require at runtime instead.
  serverExternalPackages: ["potrace", "jimp"],
};

export default nextConfig;
