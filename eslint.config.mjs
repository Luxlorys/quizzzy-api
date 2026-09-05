import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

/**
 * Type-aware linting over the whole repo — tests included, because tests are
 * code too. Formatting is Prettier's job; this config only carries semantic
 * rules. Architectural boundaries are not linted here — that is
 * dependency-cruiser's job (npm run boundaries).
 */
export default tseslint.config(
    {
        ignores: ["dist/**", "node_modules/**", "coverage/**", "src/generated/**"],
    },
    js.configs.recommended,
    ...tseslint.configs.strictTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "no-console": "error",
            "@typescript-eslint/no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
            ],
            // Fastify plugins are async by contract even when their body has
            // nothing to await.
            "@typescript-eslint/require-await": "off",
            "@typescript-eslint/restrict-template-expressions": [
                "error",
                { allowNumber: true },
            ],
        },
    },
    {
        files: ["**/*.mjs", "**/*.js", "**/*.cjs"],
        ...tseslint.configs.disableTypeChecked,
    },
    {
        files: ["**/*.cjs"],
        languageOptions: {
            sourceType: "commonjs",
            globals: {
                module: "writable",
                require: "readonly",
                process: "readonly",
                __dirname: "readonly",
            },
        },
    },
    prettier,
);
