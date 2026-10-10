import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "workflows",
    environment: "node",
    passWithNoTests: true,
  },
});
