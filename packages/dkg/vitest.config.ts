import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "dkg",
    environment: "node",
    passWithNoTests: true,
  },
});
