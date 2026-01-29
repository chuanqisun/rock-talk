import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/rock-talk/",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        user: resolve(__dirname, "user.html"),
      },
    },
  },
});
