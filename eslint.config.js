// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
    // 1. Global ignores
    {
        ignores: ["dist/", "node_modules/"],
    },

    // 2. Base JS recommended rules
    eslint.configs.recommended,

    // 3. TypeScript recommended rules (type-aware)
    ...tseslint.configs.recommendedTypeChecked,

    // 4. Custom config
    {
        languageOptions: {
            globals: {
                ...globals.node,
            },
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // Allow _ prefixed unused vars (e.g., _req, _next)
            "@typescript-eslint/no-unused-vars": [
                "warn",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],

            // Backend needs console
            "no-console": "off",

            // Don't force explicit return types (TypeScript infers them)
            "@typescript-eslint/explicit-function-return-type": "off",

            // Allow async functions without await (common in Express handlers)
            "@typescript-eslint/require-await": "off",
        },
    },

    // 5. Prettier — MUST be last to override formatting rules
    eslintConfigPrettier,
);
