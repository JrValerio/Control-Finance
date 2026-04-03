import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MIGRATED_API_SERVICE_JS_PATHS = [
  "apps/api/src/services/forecast.service.js",
  "apps/api/src/services/dashboard.service.js",
  "apps/api/src/services/transactions-import.service.js",
];

const ALLOWED_WEB_SRC_JS_FILES = new Set([
  "apps/web/src/services/api.test.js",
  "apps/web/src/test/setup.js",
]);

const normalizePath = (value) => value.replace(/\\/g, "/");

const runGitList = (patterns) => {
  const output = execFileSync("git", ["ls-files", ...patterns], { encoding: "utf8" });
  return output
    .split(/\r?\n/)
    .map((line) => normalizePath(line.trim()))
    .filter(Boolean);
};

const trackedJsFiles = runGitList(["*.js"]);
const trackedSourceFiles = runGitList(["apps/api/src/**/*.js", "apps/api/src/**/*.ts"]);
const violations = [];

for (const filePath of trackedJsFiles) {
  if (filePath.startsWith("apps/web/src/") && !ALLOWED_WEB_SRC_JS_FILES.has(filePath)) {
    violations.push(
      `${filePath} -> JS em apps/web/src fora da allowlist (freeze ativo).`,
    );
  }

  if (filePath.startsWith("apps/api/src/domain/contracts/")) {
    violations.push(
      `${filePath} -> JS em contracts nao permitido (deve permanecer TypeScript).`,
    );
  }
}

for (const forbiddenPath of MIGRATED_API_SERVICE_JS_PATHS) {
  if (trackedJsFiles.includes(forbiddenPath)) {
    violations.push(
      `${forbiddenPath} -> contraparte JS de service migrado nao pode voltar.`,
    );
  }
}

const restrictedImportPattern =
  /(?:from\s+['"]|import\s*\(\s*['"])(?:[^'"]*\/(?:forecast|dashboard|transactions-import)\.service\.js)['"]/;

for (const sourcePath of trackedSourceFiles) {
  const content = readFileSync(sourcePath, "utf8");
  if (restrictedImportPattern.test(content)) {
    violations.push(
      `${sourcePath} -> import legado .js para service migrado detectado.`,
    );
  }
}

if (violations.length > 0) {
  console.error("[freeze-js] Violacoes detectadas:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

const webSrcJsFiles = trackedJsFiles.filter((path) => path.startsWith("apps/web/src/"));
const apiContractsJsFiles = trackedJsFiles.filter((path) =>
  path.startsWith("apps/api/src/domain/contracts/"),
);

console.log("[freeze-js] OK");
console.log(
  `[freeze-js] web/src js allowlist: ${webSrcJsFiles.length}/${ALLOWED_WEB_SRC_JS_FILES.size} encontrados`,
);
console.log(`[freeze-js] contracts js files: ${apiContractsJsFiles.length}`);
