import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules
    // no-unused-vars catches dead code and misspelled identifiers; a leading
    // underscore keeps intentionally-unused params/vars readable.
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "off",
    "@typescript-eslint/no-unused-disable-directive": "off",

    // React rules
    // exhaustive-deps is warn (not error) because the canvas has a few
    // intentional ref-escape hatches; new warnings should still be fixed or
    // suppressed with a comment explaining why.
    "react-hooks/exhaustive-deps": "warn",
    "react-hooks/preserve-manual-memoization": "off",
    "react-hooks/purity": "off",
    "react-hooks/refs": "off",
    "react-hooks/set-state-in-effect": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // jsx-a11y: keep the high-signal rules on. The rest of the bundle
    // (aria-proptypes, lang, label-has-associated-control, etc.) still runs
    // through core-web-vitals. These are the cheap wins.
    "jsx-a11y/anchor-is-valid": "warn",
    "jsx-a11y/alt-text": "warn",
    "jsx-a11y/click-events-have-key-events": "warn",
    "jsx-a11y/no-static-element-interactions": "warn",
    "jsx-a11y/role-supports-aria-props": "warn",
    
    // General JavaScript rules
    // no-undef / no-redeclare stay off: TypeScript already guarantees both
    // (standard typescript-eslint practice).
    "prefer-const": "error",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "off",
    "no-empty": "error",
    "no-irregular-whitespace": "error",
    "no-case-declarations": "off",
    "no-fallthrough": "error",
    "no-mixed-spaces-and-tabs": "error",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "error",
    "no-useless-escape": "error",
  },
}, {
  ignores: ["node_modules/**", ".next/**", ".open-next/**", "out/**", "build/**", ".wrangler/**", "public/**", "next-env.d.ts", "examples/**", "skills"]
}];

export default eslintConfig;
