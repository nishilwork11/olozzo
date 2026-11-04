// pm2 process file for the self-hosted server (see docs/SELF_HOSTING.md).
//   pm2 start deploy/ecosystem.config.cjs   ·   pm2 reload olozzo   ·   pm2 logs olozzo
// One instance only: SQLite has a single writer, and one Next.js process easily serves this shop.
module.exports = {
  apps: [
    {
      name: "olozzo",
      cwd: __dirname + "/..",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3100 -H 127.0.0.1", // only nginx talks to it
      env: { NODE_ENV: "production" },
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "800M",
      time: true,
    },
  ],
};
