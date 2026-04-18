import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/matchmake": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
        changeOrigin: true,
      },
    }
  }
});
