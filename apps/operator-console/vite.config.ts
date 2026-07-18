import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const appDependency = (dependencyPath: string) =>
  path.resolve(__dirname, "../../node_modules", dependencyPath);

const reactAliases = [
  { find: /^react$/, replacement: appDependency("react/index.js") },
  {
    find: /^react\/jsx-runtime$/,
    replacement: appDependency("react/jsx-runtime.js"),
  },
  {
    find: /^react\/jsx-dev-runtime$/,
    replacement: appDependency("react/jsx-dev-runtime.js"),
  },
  { find: /^react-dom$/, replacement: appDependency("react-dom/index.js") },
  {
    find: /^react-dom\/client$/,
    replacement: appDependency("react-dom/client.js"),
  },
];

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      ...reactAliases,
      { find: "@", replacement: path.resolve(__dirname, "./src") },
    ],
    dedupe: ["react", "react-dom"],
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
});
