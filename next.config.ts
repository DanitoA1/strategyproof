import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Daytona SDK pulls in native/websocket deps; keep it out of the bundle.
  serverExternalPackages: ["@daytona/sdk"],
  outputFileTracingIncludes: {
    "/api/backtest": ["./engine/backtest.py", "./data/eurusd_15m.csv"],
  },
};

export default nextConfig;
