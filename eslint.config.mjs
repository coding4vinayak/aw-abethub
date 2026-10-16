import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", "out/**", "build/**"]),
  {
    rules: {
      // Prose-heavy pages quote copy with ordinary apostrophes ("30 days'
      // notice", "the prospect's website"). React's rule wants every one
      // escaped; the copy reads worse for it and the escape is not a
      // correctness or security issue in this app's JSX.
      "react/no-unescaped-entities": "off",
    },
  },
]);

export default eslintConfig;
