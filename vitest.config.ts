import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Enable globals like describe, it, expect without imports
    globals: true,
    // Use Node.js environment for testing
    environment: "node",
    // Include test files from tests directory
    include: ["tests/**/*.test.ts"],
    // Coverage configuration
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"], // Exclude main entry point (requires MCP SDK)
    },
    // TypeScript configuration
    typecheck: {
      enabled: true,
    },
  },
});
