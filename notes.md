# TypeScript + Express Backend — Project Setup Notes

---

## 1. Project Initialization

```bash
npm init -y
```

This creates a `package.json` with default values.

---

## 2. Installing Dependencies

### Production Dependencies

```bash
npm i express dotenv
```

| Package   | Purpose                                      |
| --------- | -------------------------------------------- |
| `express` | Web framework for building APIs              |
| `dotenv`  | Loads environment variables from `.env` file |

### Dev Dependencies

```bash
npm i -D typescript tsx @types/node @types/express
```

| Package          | Purpose                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| `typescript`     | The TypeScript compiler (`tsc`) — essential, always needed                                           |
| `tsx`            | Fast TypeScript executor (uses esbuild under the hood) — runs `.ts` files directly without compiling |
| `@types/node`    | Type definitions for Node.js built-in modules                                                        |
| `@types/express` | Type definitions for Express                                                                         |

### Why `tsx` and not `ts-node` or `nodemon`?

| Tool                | Speed      | Setup                | Hot-Reload       |
| ------------------- | ---------- | -------------------- | ---------------- |
| **`tsx watch`**     | ⚡ Fastest | Zero config          | ✅ Built-in      |
| `ts-node`           | 🐢 Slow    | Extra config         | ❌ Needs nodemon |
| `nodemon + ts-node` | 🐢 Slow    | Needs `nodemon.json` | ✅ Yes           |
| `nodemon + tsx`     | ⚡ Fast    | Needs `nodemon.json` | ✅ Yes           |

**Conclusion:** `tsx watch` already watches files and restarts automatically — so both `ts-node` and `nodemon` are **redundant**. One tool does it all.

**When would you need nodemon?** Only if you need advanced watch config like watching non-TS files (`.json`, `.env`, `.graphql`) or ignoring specific directories.

---

## 3. TypeScript Configuration (`tsconfig.json`)

Generated with:

```bash
npx tsc --init
```

### Our Config:

```json
{
  "compilerOptions": {
    "module": "nodenext",
    "target": "es2022",
    "moduleResolution": "nodenext",
    "outDir": "./dist",
    "rootDir": "./src",

    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,

    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,

    "sourceMap": true,
    "isolatedModules": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

### Why Each Option:

#### Module & Target

| Option                           | Value                                      | Why                                               |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------- |
| `"module": "nodenext"`           | Uses Node.js native ESM module system      | Modern standard for Node.js                       |
| `"target": "es2022"`             | Compile to ES2022 JavaScript               | Node.js 18+ supports all ES2022 features natively |
| `"moduleResolution": "nodenext"` | Resolves modules the same way Node.js does | Required when `module` is `nodenext`              |

#### File Layout

| Option               | Value                              | Why                                      |
| -------------------- | ---------------------------------- | ---------------------------------------- |
| `"outDir": "./dist"` | Compiled JS goes to `dist/` folder | Keeps source and output separate         |
| `"rootDir": "./src"` | Source files are in `src/` folder  | Tells TypeScript where source code lives |

#### Strictness

| Option                             | Value                                              | Why                                         |
| ---------------------------------- | -------------------------------------------------- | ------------------------------------------- |
| `"strict": true`                   | Enables all strict type-checking options           | Catches bugs at compile time, best practice |
| `"noUncheckedIndexedAccess": true` | Array/object index access returns `T \| undefined` | Prevents runtime "undefined" errors         |
| `"noImplicitReturns": true`        | Error if not all code paths return a value         | Catches missing return statements           |

#### Interop

| Option                                     | Value                                            | Why                                                         |
| ------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------- |
| `"esModuleInterop": true`                  | Allows `import express from "express"` syntax    | Without it, you'd need `import * as express from "express"` |
| `"forceConsistentCasingInFileNames": true` | Error if import casing doesn't match filename    | Prevents bugs on case-sensitive OS (Linux)                  |
| `"skipLibCheck": true`                     | Skip type-checking `.d.ts` files in node_modules | Faster compilation, avoids errors in third-party types      |

#### Output

| Option                    | Value                                           | Why                                                      |
| ------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| `"sourceMap": true`       | Generates `.js.map` files alongside `.js`       | Maps compiled JS lines back to original TS for debugging |
| `"isolatedModules": true` | Ensures each file can be compiled independently | Required by `tsx` and other esbuild-based tools          |

#### Include/Exclude

| Option                                | Why                                           |
| ------------------------------------- | --------------------------------------------- |
| `"include": ["src"]`                  | Only compile files inside `src/`              |
| `"exclude": ["node_modules", "dist"]` | Don't compile dependencies or previous output |

> **Important:** `include` and `exclude` go at the **root level** of the JSON, NOT inside `compilerOptions`. This is a common mistake!

### Options We Removed (and Why)

| Removed Option                         | Why Removed                                                            |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `"jsx": "react-jsx"`                   | We're building a **backend**, not React. No JSX needed                 |
| `"declaration": true`                  | Generates `.d.ts` files — only needed for **npm libraries**, not apps  |
| `"declarationMap": true`               | Same reason — only for libraries                                       |
| `"exactOptionalPropertyTypes": true`   | Overly strict — causes friction with Express and most libraries        |
| `"verbatimModuleSyntax": true`         | Can conflict with `esModuleInterop`. Forces `import type` everywhere   |
| `"noUncheckedSideEffectImports": true` | Very new and niche — not needed for most backend projects              |
| `"moduleDetection": "force"`           | Unnecessary when you already have `"type": "module"` in `package.json` |

---

## 4. Why `"type": "module"` in package.json?

```json
{
  "type": "module"
}
```

### Two Module Systems in Node.js

|                       | CommonJS (CJS)                 | ES Modules (ESM)    |
| --------------------- | ------------------------------ | ------------------- |
| **Syntax**            | `require()` / `module.exports` | `import` / `export` |
| **package.json**      | `"type": "commonjs"` (default) | `"type": "module"`  |
| **Status**            | 🏚️ Legacy (2009)               | ✅ Modern standard  |
| **Top-level `await`** | ❌ Not supported               | ✅ Supported        |
| **Tree shaking**      | ❌ No                          | ✅ Yes              |

### What it does

Tells Node.js: "Treat all `.js` files in this project as ES Modules."

When TypeScript compiles:

```typescript
// src/index.ts → you write this
import express from "express";
```

It outputs:

```javascript
// dist/index.js → tsc outputs this
import express from "express"; // ESM syntax stays!
```

**Without** `"type": "module"` → Node.js would crash with `SyntaxError: Cannot use import statement outside a module`.

**With** `"type": "module"` → Node.js understands the ESM `import` syntax and runs it. ✅

### Why `.js` Extensions in Imports?

```typescript
import app from "./app.js"; // ← .js extension required
```

Even though the source file is `app.ts`. TypeScript resolves it correctly, and at runtime Node.js needs the `.js` extension for ESM modules.

---

## 5. Package.json Scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write src/",
    "format:check": "prettier --check src/"
  }
}
```

| Script                 | Command                  | Purpose                                                    |
| ---------------------- | ------------------------ | ---------------------------------------------------------- |
| `npm run dev`          | `tsx watch src/index.ts` | 🔥 Hot-reload dev server (instant restart on file changes) |
| `npm run build`        | `tsc`                    | 🏗️ Compile TypeScript → JavaScript into `dist/`            |
| `npm start`            | `node dist/index.js`     | 🚀 Run compiled production build                           |
| `npm run lint`         | `eslint src/`            | Check code for quality issues                              |
| `npm run lint:fix`     | `eslint src/ --fix`      | Auto-fix lint issues                                       |
| `npm run format`       | `prettier --write src/`  | Format all files with Prettier                             |
| `npm run format:check` | `prettier --check src/`  | Check if files are formatted (useful in CI)                |

---

## 6. ESLint Setup

### Packages Installed

```bash
npm i -D eslint @eslint/js typescript-eslint globals eslint-config-prettier
```

| Package                  | Purpose                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `eslint`                 | Core linter                                                                                                                 |
| `@eslint/js`             | ESLint's recommended JavaScript rules                                                                                       |
| `typescript-eslint`      | TypeScript parser + rules (unified package — replaces old `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin`) |
| `globals`                | Predefined global variables (node, browser, etc.)                                                                           |
| `eslint-config-prettier` | Turns OFF ESLint rules that conflict with Prettier                                                                          |

### Config File (`eslint.config.js`)

ESLint 9+ uses the new **flat config** format. The old `.eslintrc` is deprecated.

```javascript
// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  eslintConfigPrettier, // MUST be last
);
```

### What is `// @ts-check`?

It's a TypeScript directive that enables type checking in a **plain JavaScript file**. Since `eslint.config.js` is a `.js` file (ESLint doesn't support `.ts` config yet), adding `// @ts-check` gives you type error highlighting and autocomplete in VS Code. It's optional — your config works without it.

### 3 Config Levels

`typescript-eslint` offers 3 strictness levels:

| Config                       | Strictness  | Type-Aware | Best For                        |
| ---------------------------- | ----------- | ---------- | ------------------------------- |
| `recommended`                | 🟢 Basic    | ❌ No      | Quick setup                     |
| **`recommendedTypeChecked`** | 🟡 Moderate | ✅ Yes     | **Most projects (what we use)** |
| `strictTypeChecked`          | 🔴 Maximum  | ✅ Yes     | Libraries, critical apps        |

### Custom Rules Explained

| Rule                                               | Setting                          | Why                                                             |
| -------------------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| `@typescript-eslint/no-unused-vars`                | `"warn"` with `_` prefix ignored | Allow `_req`, `_next` patterns in Express handlers              |
| `no-console`                                       | `"off"`                          | Backend needs `console.log`                                     |
| `@typescript-eslint/explicit-function-return-type` | `"off"`                          | TypeScript infers return types — no need to write them manually |
| `@typescript-eslint/require-await`                 | `"off"`                          | Express handlers are often async but may not use await          |

---

## 7. Prettier Setup

### Packages Installed

```bash
npm i -D prettier eslint-config-prettier
```

### How ESLint + Prettier Work Together

```
Prettier  →  handles FORMATTING (indentation, quotes, semicolons, line width)
ESLint    →  handles CODE QUALITY (unused vars, type errors, bad patterns)

eslint-config-prettier  →  turns OFF ESLint formatting rules that conflict with Prettier
```

**No overlap, no conflicts.** Each tool does its own job.

### Config File (`.prettierrc`)

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

| Option           | Value      | What It Does                                       |
| ---------------- | ---------- | -------------------------------------------------- |
| `semi`           | `true`     | Add semicolons at end of statements                |
| `singleQuote`    | `false`    | Use double quotes `"hello"`                        |
| `tabWidth`       | `2`        | 2 spaces for indentation                           |
| `trailingComma`  | `"all"`    | Add trailing commas everywhere (cleaner git diffs) |
| `printWidth`     | `100`      | Max line width before wrapping                     |
| `bracketSpacing` | `true`     | Spaces inside objects: `{ key: value }`            |
| `arrowParens`    | `"always"` | Always wrap arrow function params: `(x) => x`      |
| `endOfLine`      | `"lf"`     | Use Unix line endings (consistent across OS)       |

### Ignore File (`.prettierignore`)

```
dist
node_modules
package-lock.json
```

Tells Prettier to skip these files/folders when formatting.

---

## 8. Source Maps (`.js.map` files)

### What Are They?

When you run `npm run build`, TypeScript compiles each `.ts` file into two files:

```
src/index.ts  →  dist/index.js      (compiled code)
                  dist/index.js.map  (mapping file)
```

The `.map` file is a **translation table** that maps compiled JS line numbers back to original TS line numbers.

### Why They Matter

**Without source maps:**

```
Error: Something broke!
    at dist/index.js:8:15     ← Compiled JS line (useless for debugging)
```

**With source maps + `--enable-source-maps`:**

```
Error: Something broke!
    at src/index.ts:14:15     ← Original TypeScript line! ✅
```

### Is `--enable-source-maps` Recommended in Production?

**Yes.** The performance cost is negligible:

- `.map` files are loaded into memory **once** at startup (~5-10 MB extra)
- The mapping lookup only happens **when an error is thrown** (not on every request)
- Companies like Sentry, Datadog all **recommend** source maps in production

**Recommended `start` script:**

```json
"start": "node --enable-source-maps dist/index.js"
```

---

## 9. Development vs Production Flow

### Development (your machine)

```bash
npm run dev
```

- Runs `tsx watch src/index.ts`
- **No build step**, no `dist/`, no `.map` files involved
- Instant hot-reload on file changes
- Errors already point to `.ts` files because you're running TypeScript directly

### Production (Docker / Server)

```bash
npm run build     # Step 1: Compile TS → JS (into dist/)
npm start         # Step 2: Run compiled JS
```

- `tsc` compiles `src/*.ts` → `dist/*.js` + `dist/*.js.map`
- `node dist/index.js` runs the compiled code
- Source maps provide readable error traces if enabled

---

## 10. Docker Setup

### Development Dockerfile (`Dockerfile.dev`)

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
```

### Production Dockerfile (`Dockerfile`)

```dockerfile
# --- Build Stage ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Production Stage ---
FROM node:22-alpine
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
USER appuser
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1
CMD ["node", "--enable-source-maps", "dist/index.js"]
```

**Why multi-stage?**

- Build stage: has `typescript`, `tsx`, `eslint` (heavy, ~200MB)
- Production stage: only has `express`, `dotenv` (lightweight, ~50MB)
- Result: Much smaller Docker image

**Why `CMD ["array"]` format (exec form)?**

- `node` becomes PID 1 (receives shutdown signals like SIGTERM directly)
- Graceful shutdown works properly
- Shell form (`CMD node ...`) wraps in `/bin/sh` which may not forward signals

### Docker Compose (`docker-compose.yml`)

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    volumes:
      - .:/app # Sync source code into container (live reload)
      - /app/node_modules # Keep container's node_modules intact
    environment:
      - NODE_ENV=development
```

**The volume trick:**

- `.:/app` — bind mount syncs your local files into the container
- `/app/node_modules` — anonymous volume prevents overwriting container's `node_modules`
- When you edit a file locally → container sees the change → `tsx watch` restarts → hot-reload works!

---

## 11. What's Still Needed for Production Deployment

| #   | What                               | Priority | Status     |
| --- | ---------------------------------- | -------- | ---------- |
| 1   | Helmet (security headers)          | 🔴 Must  | ❌ Not yet |
| 2   | CORS                               | 🔴 Must  | ❌ Not yet |
| 3   | Pino logger (replace console.log)  | 🟡 Good  | ❌ Not yet |
| 4   | Graceful shutdown (handle SIGTERM) | 🔴 Must  | ❌ Not yet |
| 5   | Error handling middleware          | 🔴 Must  | ❌ Not yet |
| 6   | `.dockerignore` file               | 🔴 Must  | ❌ Not yet |
| 7   | `.env.example` file                | 🟡 Good  | ❌ Not yet |
| 8   | Non-root Docker user               | 🟡 Good  | ❌ Not yet |

---

## 12. Current Project Structure

```
📁 05-Docker-Compose-Production-Deployment/
├── 📁 src/
│   └── index.ts              ← Entry point
├── 📁 dist/                  ← Compiled output (auto-generated by `tsc`)
│   ├── index.js
│   └── index.js.map
├── eslint.config.js          ← ESLint flat config (ESLint 9+)
├── .prettierrc               ← Prettier formatting rules
├── .prettierignore           ← Prettier ignore list
├── tsconfig.json             ← TypeScript configuration
├── package.json              ← Scripts & dependencies
└── package-lock.json         ← Locked dependency versions
```

---

## 13. All Installed Packages Summary

### Production (`dependencies`)

| Package   | Version | Purpose               |
| --------- | ------- | --------------------- |
| `express` | ^5.2.1  | Web framework         |
| `dotenv`  | ^17.3.1 | Environment variables |

### Development (`devDependencies`)

| Package                  | Version | Purpose                                           |
| ------------------------ | ------- | ------------------------------------------------- |
| `typescript`             | ^5.9.3  | TypeScript compiler                               |
| `tsx`                    | ^4.21.0 | Fast TS executor (dev server)                     |
| `@types/node`            | ^25.3.0 | Node.js type definitions                          |
| `@types/express`         | ^5.0.6  | Express type definitions                          |
| `eslint`                 | ^10.0.1 | Code quality linter                               |
| `@eslint/js`             | ^10.0.1 | ESLint recommended JS rules                       |
| `typescript-eslint`      | ^8.56.0 | TypeScript ESLint parser + rules                  |
| `globals`                | ^17.3.0 | Global variables for ESLint                       |
| `prettier`               | ^3.8.1  | Code formatter                                    |
| `eslint-config-prettier` | ^10.1.8 | Disables ESLint rules that conflict with Prettier |

---

## Quick Reference Commands

```bash
# Development
npm run dev          # Start dev server with hot-reload
npm run lint         # Check for code issues
npm run lint:fix     # Auto-fix code issues
npm run format       # Format code with Prettier
npm run format:check # Check formatting (CI)

# Production
npm run build        # Compile TypeScript → JavaScript
npm start            # Run production build
```
