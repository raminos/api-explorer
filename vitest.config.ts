import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    clearMocks: true,
    coverage: { provider: "v8", reporter: ["text", "html"] },
    include: ["src/**/__tests__/**/*.test.ts", "tests/**/*.test.ts"],
    pool: "forks",
    sequence: { concurrent: false },
  },
});
