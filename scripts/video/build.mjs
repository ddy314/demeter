import { build } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
export const site = fileURLToPath(
  new URL("../../artifacts/video/work/site/", import.meta.url),
);
export async function buildFilm() {
  await build({
    configFile: false,
    root: fileURLToPath(new URL("../../apps/web/", import.meta.url)),
    plugins: [react()],
    build: {
      outDir: site,
      emptyOutDir: true,
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        input: fileURLToPath(
          new URL("../../apps/web/video.html", import.meta.url),
        ),
      },
    },
  });
}
