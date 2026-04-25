import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/matchmake": {
        target: "http://localhost:2567",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:2567",
        ws: true,
        changeOrigin: true,
      },
    }
  }
});
