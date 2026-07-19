import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const ROOT = process.cwd();
const FIX = process.argv.includes("--fix");
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".open-knowledge",
  ".vercel",
  "coverage",
  "data",
  "node_modules",
  "playwright-report",
  "test-results",
]);

/** Returns every JavaScript or TypeScript source file owned by the repository. */
function sourceFiles(directory = ROOT) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(absolutePath));
    } else if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
      !entry.name.endsWith(".d.ts")
    ) {
      files.push(absolutePath);
    }
  }
  return files.sort();
}

/** Returns a stable display name for a supported named function node. */
function functionName(node) {
  if (ts.isConstructorDeclaration(node)) return "constructor";
  if (node.name && (ts.isIdentifier(node.name) || ts.isPrivateIdentifier(node.name))) {
    return node.name.text;
  }
  if (node.name && (ts.isStringLiteral(node.name) || ts.isNumericLiteral(node.name))) {
    return node.name.text;
  }
  return null;
}

/** Resolves the syntax node that owns the function's leading TSDoc block. */
function documentationTarget(node) {
  if (
    ts.isVariableDeclaration(node) &&
    ts.isVariableDeclarationList(node.parent) &&
    ts.isVariableStatement(node.parent.parent)
  ) {
    return node.parent.parent;
  }
  if (ts.isFunctionExpression(node)) {
    let ancestor = node.parent;
    while (ancestor && !ts.isStatement(ancestor)) {
      if (
        ts.isVariableDeclaration(ancestor) &&
        ts.isVariableDeclarationList(ancestor.parent) &&
        ts.isVariableStatement(ancestor.parent.parent)
      ) {
        return ancestor.parent.parent;
      }
      ancestor = ancestor.parent;
    }
  }
  return node;
}

/** Detects whether a syntax node has an immediately attached TSDoc block. */
function hasDocstring(sourceFile, node) {
  const target = documentationTarget(node);
  const leadingText = sourceFile.text.slice(
    target.getFullStart(),
    target.getStart(sourceFile),
  );
  return /\/\*\*[\s\S]*?\*\/\s*$/.test(leadingText);
}

/** Converts a code identifier into readable lowercase words. */
function wordsFromName(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Builds a concise purpose statement from a stable function name and file role. */
function generatedDescription(name, relativePath) {
  if (name === "constructor") return "Creates a new instance with the supplied state.";
  const words = wordsFromName(name);
  if (/^[A-Z]/.test(name) && /\.[jt]sx$/.test(relativePath)) {
    return `Renders the ${words} interface.`;
  }
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(relativePath)) {
    return `Supports the ${words} test scenario.`;
  }
  const patterns = [
    [/^(is|has|can|should|needs|allows)\b/, `Determines whether ${words}.`],
    [/^(assert|validate|verify|check)\b/, `Validates ${words.replace(/^(assert|validate|verify|check)\s*/, "") || "the supplied state"}.`],
    [/^(get|load|read|find|query|resolve|select|list|collect)\b/, `Retrieves ${words.replace(/^(get|load|read|find|query|resolve|select|list|collect)\s*/, "") || "the requested data"}.`],
    [/^(parse|decode)\b/, `Parses ${words.replace(/^(parse|decode)\s*/, "") || "the supplied value"}.`],
    [/^(format|serialize|encode|stringify)\b/, `Formats ${words.replace(/^(format|serialize|encode|stringify)\s*/, "") || "the supplied value"}.`],
    [/^(build|create|make|draft|payload|map|convert|normalize)\b/, `Builds ${words.replace(/^(build|create|make|draft|payload|map|convert|normalize)\s*/, "") || "the requested value"}.`],
    [/^(seed|bootstrap)\b/, `Seeds ${words.replace(/^(seed|bootstrap)\s*/, "") || "the required data"}.`],
    [/^(initialize|migrate|upgrade|downgrade)\b/, `Applies the ${words} operation.`],
    [/^(update|set|refresh|sync)\b/, `Updates ${words.replace(/^(update|set|refresh|sync)\s*/, "") || "the current state"}.`],
    [/^(delete|remove|clear|reset|retire|archive)\b/, `Removes or resets ${words.replace(/^(delete|remove|clear|reset|retire|archive)\s*/, "") || "the selected state"}.`],
    [/^(record|save|write|persist|upsert|insert)\b/, `Records ${words.replace(/^(record|save|write|persist|upsert|insert)\s*/, "") || "the supplied data"}.`],
    [/^(count|calculate|compute|sum|average)\b/, `Calculates ${words.replace(/^(count|calculate|compute|sum|average)\s*/, "") || "the requested result"}.`],
    [/^(handle|submit|run|execute|dispatch|main)\b/, `Runs the ${words} workflow.`],
  ];
  for (const [pattern, description] of patterns) {
    if (pattern.test(words)) return description;
  }
  return `Implements the ${words} operation.`;
}

/** Identifies named runtime functions covered by the repository policy. */
function namedFunction(node) {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  ) {
    return functionName(node);
  }
  if (
    ts.isVariableDeclaration(node) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)) &&
    ts.isVariableStatement(node.parent.parent)
  ) {
    return functionName(node);
  }
  if (
    (ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node)) &&
    node.initializer &&
    (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
  ) {
    return functionName(node);
  }
  if (
    ts.isFunctionExpression(node) &&
    node.name &&
    !ts.isVariableDeclaration(node.parent) &&
    !ts.isPropertyAssignment(node.parent) &&
    !ts.isPropertyDeclaration(node.parent)
  ) {
    return functionName(node);
  }
  return null;
}

/** Collects named functions and their documentation status from one source file. */
function analyzeFile(absolutePath) {
  const text = fs.readFileSync(absolutePath, "utf8");
  const relativePath = path.relative(ROOT, absolutePath);
  const sourceFile = ts.createSourceFile(
    absolutePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    absolutePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const functions = [];
  /** Visits syntax nodes and records supported named functions. */
  function visit(node) {
    const name = namedFunction(node);
    if (name) {
      const target = documentationTarget(node);
      const location = sourceFile.getLineAndCharacterOfPosition(target.getStart(sourceFile));
      functions.push({
        name,
        relativePath,
        line: location.line + 1,
        documented: hasDocstring(sourceFile, node),
        insertionPosition: target.getStart(sourceFile),
        description: generatedDescription(name, relativePath),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return { absolutePath, text, functions };
}

/** Inserts missing TSDoc blocks without modifying executable source text. */
function applyFixes(analysis) {
  const edits = new Map();
  for (const entry of analysis.functions) {
    if (entry.documented || edits.has(entry.insertionPosition)) continue;
    const lineStart = analysis.text.lastIndexOf("\n", entry.insertionPosition - 1) + 1;
    const linePrefix = analysis.text.slice(lineStart, entry.insertionPosition);
    const content = /^\s*$/.test(linePrefix)
      ? `/** ${entry.description} */\n${linePrefix}`
      : `/** ${entry.description} */ `;
    edits.set(
      entry.insertionPosition,
      content,
    );
  }
  if (edits.size === 0) return 0;
  let next = analysis.text;
  for (const [position, content] of [...edits.entries()].sort((a, b) => b[0] - a[0])) {
    next = `${next.slice(0, position)}${content}${next.slice(position)}`;
  }
  fs.writeFileSync(analysis.absolutePath, next);
  return edits.size;
}

/** Checks coverage, optionally fixes omissions, and exits nonzero on violations. */
function main() {
  let analyses = sourceFiles().map(analyzeFile);
  if (FIX) {
    const changedFiles = analyses.filter((analysis) => applyFixes(analysis) > 0).length;
    console.log(`Added missing TSDoc blocks in ${changedFiles} file(s).`);
    analyses = sourceFiles().map(analyzeFile);
  }

  const functions = analyses.flatMap((analysis) => analysis.functions);
  const missing = functions.filter((entry) => !entry.documented);
  const documented = functions.length - missing.length;
  const coverage = functions.length === 0 ? 100 : (documented / functions.length) * 100;
  console.log(
    `Named-function TSDoc coverage: ${documented}/${functions.length} (${coverage.toFixed(2)}%).`,
  );
  if (missing.length === 0) return;
  for (const entry of missing.slice(0, 100)) {
    console.error(`${entry.relativePath}:${entry.line} ${entry.name}`);
  }
  if (missing.length > 100) {
    console.error(`...and ${missing.length - 100} more undocumented function(s).`);
  }
  process.exitCode = 1;
}

main();
