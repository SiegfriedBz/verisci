import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "agents",
    environment: "node",
    passWithNoTests: true,
  },
});
