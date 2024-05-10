/** @type {import('@remix-run/dev').AppConfig} */
export default {
  ignoredRouteFiles: ["**/*.css"],
  // appDirectory: "app",
  // assetsBuildDirectory: "public/build",
  // publicPath: "/build/",
  // serverBuildPath: "build/index.js",
  tailwind: true,
  browserNodeBuiltinsPolyfill: {
    modules: {
      buffer: true,
      path: true,
      events: true,
      stream: true,
      string_decoder: true,
    },
    globals: {
      Buffer: true,
    },
  },
};
