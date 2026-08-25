import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const requestedOutput = process.argv[2];
const outputRoot = resolve(repositoryRoot, requestedOutput ?? "exports/icons/needo-icons-current");

if (existsSync(outputRoot)) {
  throw new Error(`Icon export destination already exists: ${outputRoot}`);
}

const svgDirectory = join(outputRoot, "svg");
const originalDirectory = join(outputRoot, "original");
mkdirSync(svgDirectory, { recursive: true });
mkdirSync(originalDirectory, { recursive: true });

const manifest = [];
const reservedExportPaths = new Set();
const sourceRoot = join(repositoryRoot, "src");
const publicRoot = join(repositoryRoot, "public");

const paletteFallback = {
  badgeBg: "#eef7f5",
  badgeBorder: "#cfe4df",
  badgeShadow: "none",
  primary: "#3c887e",
  primaryDark: "#275f57",
  secondary: "#75b2a9",
  secondaryDark: "#4f978d",
  surface: "#ffffff",
  surfaceShade: "#d7e9e5",
  outline: "#1f5b51",
  shadow: "#18443d",
  glow: "#75b2a9"
};

const attributeNameMap = new Map([
  ["className", "class"],
  ["clipPath", "clip-path"],
  ["fillOpacity", "fill-opacity"],
  ["fillRule", "fill-rule"],
  ["fontFamily", "font-family"],
  ["fontSize", "font-size"],
  ["fontWeight", "font-weight"],
  ["gradientTransform", "gradientTransform"],
  ["gradientUnits", "gradientUnits"],
  ["markerEnd", "marker-end"],
  ["markerStart", "marker-start"],
  ["preserveAspectRatio", "preserveAspectRatio"],
  ["stopColor", "stop-color"],
  ["stopOpacity", "stop-opacity"],
  ["strokeDasharray", "stroke-dasharray"],
  ["strokeDashoffset", "stroke-dashoffset"],
  ["strokeLinecap", "stroke-linecap"],
  ["strokeLinejoin", "stroke-linejoin"],
  ["strokeMiterlimit", "stroke-miterlimit"],
  ["strokeOpacity", "stroke-opacity"],
  ["strokeWidth", "stroke-width"],
  ["textAnchor", "text-anchor"],
  ["vectorEffect", "vector-effect"],
  ["viewBox", "viewBox"]
]);

const skippedRootAttributes = new Set([
  "aria-hidden",
  "aria-label",
  "class",
  "className",
  "data-testid",
  "height",
  "role",
  "style",
  "width"
]);

const allowedSvgTags = new Set([
  "circle",
  "clipPath",
  "defs",
  "ellipse",
  "g",
  "line",
  "linearGradient",
  "mask",
  "path",
  "polygon",
  "polyline",
  "radialGradient",
  "rect",
  "stop",
  "svg",
  "text",
  "tspan",
  "use"
]);

function listFiles(directory, predicate) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listFiles(fullPath, predicate));
    } else if (predicate(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
}

function listTopLevelFiles(directory, predicate) {
  return readdirSync(directory)
    .map((entry) => join(directory, entry))
    .filter((filePath) => statSync(filePath).isFile() && predicate(filePath));
}

function toPosix(value) {
  return value.split(sep).join("/");
}

function slugify(value) {
  return value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9\u3040-\u30ff\u3400-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "icon";
}

function escapeXml(value) {
  return `${value}`
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtml(value) {
  return escapeXml(value).replaceAll("'", "&#39;");
}

function literalValue(expression, context = {}) {
  if (!expression) {
    return undefined;
  }
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression) || ts.isNumericLiteral(expression)) {
    return expression.text;
  }
  if (expression.kind === ts.SyntaxKind.TrueKeyword) {
    return "true";
  }
  if (expression.kind === ts.SyntaxKind.FalseKeyword) {
    return "false";
  }
  if (ts.isPrefixUnaryExpression(expression) && ts.isNumericLiteral(expression.operand)) {
    return expression.operator === ts.SyntaxKind.MinusToken ? `-${expression.operand.text}` : expression.operand.text;
  }
  if (ts.isParenthesizedExpression(expression)) {
    return literalValue(expression.expression, context);
  }
  if (ts.isConditionalExpression(expression)) {
    return literalValue(expression.whenTrue, context) ?? literalValue(expression.whenFalse, context);
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const owner = expression.expression.getText();
    const property = expression.name.text;
    if (owner === "palette") {
      return context.palette?.[property] ?? paletteFallback[property] ?? "currentColor";
    }
    if (owner === "sharedProps" && property === "viewBox") {
      return "0 0 24 24";
    }
  }
  if (ts.isIdentifier(expression)) {
    const identifierDefaults = {
      fill: "currentColor",
      open: "false",
      opacity: "1",
      size: "24",
      strokeWidth: "2",
      width: "24",
      height: "24"
    };
    return identifierDefaults[expression.text];
  }
  return undefined;
}

function getJsxTagName(tagName) {
  if (ts.isIdentifier(tagName)) {
    return tagName.text;
  }
  return tagName.getText();
}

function getAttributeValue(attribute, context) {
  if (!attribute.initializer) {
    return "true";
  }
  if (ts.isStringLiteral(attribute.initializer)) {
    return attribute.initializer.text;
  }
  if (ts.isJsxExpression(attribute.initializer)) {
    return literalValue(attribute.initializer.expression, context);
  }
  return undefined;
}

function serializeAttributes(attributes, context, isRoot = false) {
  const serialized = [];
  for (const property of attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) {
      continue;
    }
    const originalName = property.name.getText();
    const mappedName = attributeNameMap.get(originalName) ?? originalName;
    if (
      (isRoot && skippedRootAttributes.has(originalName)) ||
      originalName.startsWith("on") ||
      originalName === "draggable" ||
      originalName === "key"
    ) {
      continue;
    }
    const value = getAttributeValue(property, context);
    if (value === undefined) {
      continue;
    }
    serialized.push(`${mappedName}="${escapeXml(value)}"`);
  }
  return serialized;
}

function getNumericJsxAttribute(node, name, fallback) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  const attribute = opening.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.getText() === name
  );
  if (!attribute || !ts.isJsxAttribute(attribute)) {
    return fallback;
  }
  const value = getAttributeValue(attribute, {});
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function shareNetworkPathMarkup(strokeWidth = 2.3) {
  return [
    `<path d="M8.6 10.5 15.4 6.5M8.6 13.5l6.8 4" stroke="currentColor" stroke-linecap="round" stroke-width="${strokeWidth}"/>`,
    `<circle cx="18" cy="5" r="3" stroke="currentColor" stroke-width="${strokeWidth}"/>`,
    `<circle cx="6" cy="12" r="3" stroke="currentColor" stroke-width="${strokeWidth}"/>`,
    `<circle cx="18" cy="19" r="3" stroke="currentColor" stroke-width="${strokeWidth}"/>`
  ].join("");
}

function serializeComponentNode(node, tagName, context) {
  if (tagName === "GroundShadow") {
    const x = getNumericJsxAttribute(node, "x", 16);
    const y = getNumericJsxAttribute(node, "y", 25.5);
    const rx = getNumericJsxAttribute(node, "rx", 8.5);
    const ry = getNumericJsxAttribute(node, "ry", 2.4);
    const shadow = context.palette?.shadow ?? paletteFallback.shadow;
    return `<ellipse cx="${x}" cy="${y}" fill="${escapeXml(shadow)}" opacity="0.55" rx="${rx}" ry="${ry}"/>`;
  }
  if (tagName === "Outline") {
    const width = getNumericJsxAttribute(node, "width", 1.6);
    const outline = context.palette?.outline ?? paletteFallback.outline;
    const children = ts.isJsxElement(node) ? serializeChildren(node.children, context) : { markup: "", unresolved: false };
    return `<g fill="none" stroke="${escapeXml(outline)}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${width}">${children.markup}</g>`;
  }
  if (tagName === "ShareNetworkIconPath") {
    return shareNetworkPathMarkup(getNumericJsxAttribute(node, "strokeWidth", 2.3));
  }
  return undefined;
}

function serializeJsxNode(node, context = {}, isRoot = false) {
  if (ts.isJsxText(node)) {
    const text = node.getText().replace(/\s+/g, " ").trim();
    return { markup: text ? escapeXml(text) : "", unresolved: false };
  }
  if (ts.isJsxExpression(node)) {
    if (!node.expression) {
      return { markup: "", unresolved: false };
    }
    if (ts.isConditionalExpression(node.expression)) {
      const chosen = ts.isJsxElement(node.expression.whenTrue) || ts.isJsxSelfClosingElement(node.expression.whenTrue)
        ? node.expression.whenTrue
        : node.expression.whenFalse;
      return serializeJsxNode(chosen, context);
    }
    return { markup: "", unresolved: true };
  }
  if (ts.isJsxFragment(node)) {
    return serializeChildren(node.children, context);
  }
  if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) {
    return { markup: "", unresolved: true };
  }

  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  const tagName = getJsxTagName(opening.tagName);
  if (!allowedSvgTags.has(tagName)) {
    const componentMarkup = serializeComponentNode(node, tagName, context);
    return componentMarkup === undefined
      ? { markup: "", unresolved: true }
      : { markup: componentMarkup, unresolved: false };
  }

  const attributes = serializeAttributes(opening.attributes, context, isRoot);
  if (tagName === "svg") {
    attributes.unshift('xmlns="http://www.w3.org/2000/svg"');
    if (!attributes.some((value) => value.startsWith("viewBox="))) {
      attributes.push('viewBox="0 0 24 24"');
    }
    if (!attributes.some((value) => value.startsWith("color="))) {
      attributes.push('color="#111827"');
    }
  }

  if (ts.isJsxSelfClosingElement(node)) {
    return { markup: `<${tagName}${attributes.length ? ` ${attributes.join(" ")}` : ""}/>`, unresolved: false };
  }
  const children = serializeChildren(node.children, context);
  return {
    markup: `<${tagName}${attributes.length ? ` ${attributes.join(" ")}` : ""}>${children.markup}</${tagName}>`,
    unresolved: children.unresolved
  };
}

function serializeChildren(children, context) {
  let markup = "";
  let unresolved = false;
  for (const child of children) {
    const serialized = serializeJsxNode(child, context);
    markup += serialized.markup;
    unresolved ||= serialized.unresolved;
  }
  return { markup, unresolved };
}

function wrapSvg(markup, viewBox, extraAttributes = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="none" color="#111827"${extraAttributes ? ` ${extraAttributes}` : ""}>${markup}</svg>`;
}

function getLiteralViewBox(svgNode) {
  const opening = svgNode.openingElement;
  const attribute = opening.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.getText() === "viewBox"
  );
  if (!attribute || !ts.isJsxAttribute(attribute)) {
    return undefined;
  }
  return getAttributeValue(attribute, {});
}

function isSmallViewBox(viewBox) {
  if (!viewBox) {
    return false;
  }
  const values = viewBox.trim().split(/[\s,]+/).map(Number);
  return values.length === 4 && values.every(Number.isFinite) && values[2] <= 64 && values[3] <= 64;
}

function findFunctionName(node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return current.name.text;
    }
    if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) && current.parent && ts.isVariableDeclaration(current.parent) && ts.isIdentifier(current.parent.name)) {
      return current.parent.name.text;
    }
    if (ts.isMethodDeclaration(current) && current.name) {
      return current.name.getText();
    }
    current = current.parent;
  }
  return "inline";
}

function findBranchLabel(node) {
  const labels = [];
  let current = node.parent;
  while (current && !ts.isFunctionDeclaration(current) && !ts.isArrowFunction(current) && !ts.isFunctionExpression(current)) {
    if (ts.isCaseClause(current) && ts.isStringLiteral(current.expression)) {
      labels.push(current.expression.text);
    }
    if (ts.isIfStatement(current)) {
      const values = [];
      const visit = (child) => {
        if (ts.isStringLiteral(child)) {
          values.push(child.text);
        }
        ts.forEachChild(child, visit);
      };
      visit(current.expression);
      labels.push(...values.filter((value) => value.length <= 32));
    }
    current = current.parent;
  }
  return [...new Set(labels)].map(slugify).filter(Boolean).slice(0, 4).join("-");
}

function uniqueExportPath(preferredPath) {
  let candidate = preferredPath;
  let suffix = 2;
  while (reservedExportPaths.has(candidate)) {
    const extension = extname(preferredPath);
    candidate = `${preferredPath.slice(0, -extension.length)}-${suffix}${extension}`;
    suffix += 1;
  }
  reservedExportPaths.add(candidate);
  return candidate;
}

function writeSvgEntry({ family, name, sourceFile, sourceLine, svg, variant, notes }) {
  const fileName = `${slugify(name)}.svg`;
  const exportPath = uniqueExportPath(toPosix(join("svg", slugify(family), fileName)));
  const absolutePath = join(outputRoot, exportPath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, `${svg}\n`);
  manifest.push({
    id: createHash("sha1").update(`${family}:${name}:${sourceFile}:${sourceLine}`).digest("hex").slice(0, 12),
    family,
    name,
    format: "svg",
    exportPath,
    source: sourceFile,
    sourceLine,
    variant: variant ?? "",
    notes: notes ?? "generated from current JSX source"
  });
}

function parseSourceFile(filePath) {
  const sourceText = readFileSync(filePath, "utf8");
  return ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function exportDirectInlineSvgs() {
  const sourceFiles = listFiles(sourceRoot, (filePath) => filePath.endsWith(".tsx"));
  for (const filePath of sourceFiles) {
    const sourceFile = parseSourceFile(filePath);
    const sourceRelative = toPosix(relative(repositoryRoot, filePath));
    const visit = (node) => {
      if (ts.isJsxElement(node) && getJsxTagName(node.openingElement.tagName) === "svg") {
        const viewBox = getLiteralViewBox(node);
        const functionName = findFunctionName(node);
        if (isSmallViewBox(viewBox)) {
          const serialized = serializeJsxNode(node, {}, true);
          if (!serialized.unresolved && /<(path|circle|rect|line|polyline|polygon|ellipse|text)\b/.test(serialized.markup)) {
            const sourceLine = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            const branchLabel = findBranchLabel(node);
            const fileSlug = slugify(sourceRelative.replace(/^src\//, "").replace(/\.tsx$/, ""));
            const name = `${fileSlug}--${slugify(functionName)}--${branchLabel || `line-${sourceLine}`}`;
            writeSvgEntry({
              family: "source-inline",
              name,
              sourceFile: sourceRelative,
              sourceLine,
              svg: serialized.markup,
              variant: branchLabel,
              notes: "standalone SVG exported from an inline React SVG"
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
}

function findFunction(sourceFile, name) {
  let result;
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

function findFirstSwitch(node) {
  let result;
  const visit = (child) => {
    if (result) {
      return;
    }
    if (ts.isSwitchStatement(child)) {
      result = child;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return result;
}

function findReturnExpression(node) {
  let expression;
  const visit = (child) => {
    if (expression) {
      return;
    }
    if (ts.isReturnStatement(child) && child.expression) {
      expression = child.expression;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return expression;
}

function serializeFamilyExpression(expression, context) {
  if (!expression) {
    return { markup: "", unresolved: true };
  }
  if (ts.isParenthesizedExpression(expression)) {
    return serializeFamilyExpression(expression.expression, context);
  }
  if (ts.isJsxFragment(expression)) {
    return serializeChildren(expression.children, context);
  }
  if (ts.isJsxElement(expression)) {
    const tagName = getJsxTagName(expression.openingElement.tagName);
    if (tagName === "IconSvg") {
      return serializeChildren(expression.children, context);
    }
  }
  return serializeJsxNode(expression, context);
}

function parsePalette(sourceFile, variableName) {
  let result;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === variableName &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    ) {
      result = {};
      for (const property of node.initializer.properties) {
        if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
          const value = literalValue(property.initializer);
          if (value !== undefined) {
            result[property.name.text] = value;
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { ...paletteFallback, ...result };
}

function exportSwitchFamily({ file, functionName, family, viewBox, paletteVariable }) {
  const absoluteFile = join(repositoryRoot, file);
  const sourceFile = parseSourceFile(absoluteFile);
  const functionNode = findFunction(sourceFile, functionName);
  const switchNode = functionNode && findFirstSwitch(functionNode);
  if (!functionNode || !switchNode) {
    throw new Error(`Unable to find ${functionName} switch in ${file}`);
  }
  const context = paletteVariable ? { palette: parsePalette(sourceFile, paletteVariable) } : {};
  let pendingLabels = [];
  for (const clause of switchNode.caseBlock.clauses) {
    if (ts.isCaseClause(clause) && ts.isStringLiteral(clause.expression)) {
      pendingLabels.push(clause.expression.text);
    } else if (ts.isDefaultClause(clause)) {
      pendingLabels.push("default");
    }
    const returnExpression = findReturnExpression(clause);
    if (!returnExpression) {
      continue;
    }
    const serialized = serializeFamilyExpression(returnExpression, context);
    const sourceLine = sourceFile.getLineAndCharacterOfPosition(clause.getStart()).line + 1;
    if (!serialized.unresolved && serialized.markup) {
      for (const label of pendingLabels) {
        writeSvgEntry({
          family,
          name: label,
          sourceFile: file,
          sourceLine,
          svg: wrapSvg(serialized.markup, viewBox),
          variant: paletteVariable ? "light-green palette" : "",
          notes: paletteVariable
            ? "category icon exported with the current light-green palette; shape is shared by all client themes"
            : "standalone SVG exported from a shared icon family"
        });
      }
    }
    pendingLabels = [];
  }
}

function contactVariantName(conditionText) {
  const matchers = [
    ["unfollow", "unfollowed"],
    ["follow", "followed"],
    ["all", "all"],
    ["add", "add-custom-group"],
    ["new", "new-friend"],
    ["group", "group-chat"],
    ["tag", "tag"],
    ["official", "official-account"],
    ["service", "service-platform"],
    ["black", "blacklist"],
    ["store", "store"],
    ["customer", "customer"],
    ["staff", "staff-technician"]
  ];
  return matchers.find(([needle]) => conditionText.includes(`"${needle}"`))?.[1] ?? slugify(conditionText).slice(0, 48);
}

function exportContactGroupFamily() {
  const file = "src/components/mobile/ContactGroupIcon.tsx";
  const sourceFile = parseSourceFile(join(repositoryRoot, file));
  const functionNode = findFunction(sourceFile, "renderGroupIcon");
  if (!functionNode?.body) {
    throw new Error(`Unable to find renderGroupIcon in ${file}`);
  }
  for (const statement of functionNode.body.statements) {
    if (!ts.isIfStatement(statement)) {
      continue;
    }
    const expression = findReturnExpression(statement.thenStatement);
    const serialized = serializeFamilyExpression(expression, {});
    if (serialized.unresolved || !serialized.markup) {
      continue;
    }
    const sourceLine = sourceFile.getLineAndCharacterOfPosition(statement.getStart()).line + 1;
    const name = contactVariantName(statement.expression.getText());
    writeSvgEntry({
      family: "contact-group",
      name,
      sourceFile: file,
      sourceLine,
      svg: wrapSvg(`<g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">${serialized.markup}</g>`, "0 0 24 24"),
      notes: "standalone SVG exported from the contact-group selector"
    });
  }
  const defaultReturn = functionNode.body.statements.find((statement) => ts.isReturnStatement(statement));
  if (defaultReturn?.expression) {
    const serialized = serializeFamilyExpression(defaultReturn.expression, {});
    const sourceLine = sourceFile.getLineAndCharacterOfPosition(defaultReturn.getStart()).line + 1;
    writeSvgEntry({
      family: "contact-group",
      name: "default-person",
      sourceFile: file,
      sourceLine,
      svg: wrapSvg(`<g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">${serialized.markup}</g>`, "0 0 24 24"),
      notes: "fallback contact-group SVG"
    });
  }
}

function collectTypeAliasStrings(filePath, aliasName) {
  const sourceFile = parseSourceFile(filePath);
  let values = [];
  const visit = (node) => {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === aliasName) {
      const collect = (child) => {
        if (ts.isLiteralTypeNode(child) && ts.isStringLiteral(child.literal)) {
          values.push(child.literal.text);
        }
        ts.forEachChild(child, collect);
      };
      collect(node.type);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...new Set(values)];
}

function addOriginalAsset(publicRelativePath, sourceReference, notes) {
  const normalized = publicRelativePath.replace(/^\/+/, "");
  const sourcePath = join(publicRoot, normalized);
  if (!existsSync(sourcePath) || statSync(sourcePath).isDirectory()) {
    return;
  }
  const exportPath = uniqueExportPath(toPosix(join("original", normalized)));
  const destination = join(outputRoot, exportPath);
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(sourcePath, destination);
  manifest.push({
    id: createHash("sha1").update(`asset:${normalized}`).digest("hex").slice(0, 12),
    family: normalized.startsWith("icons/special-black/") ? "special-black" : "original-assets",
    name: basename(normalized, extname(normalized)),
    format: extname(normalized).slice(1).toLowerCase(),
    exportPath,
    source: `public/${normalized}`,
    sourceLine: "",
    variant: "original file",
    notes: notes ?? sourceReference
  });
}

function collectReferencedIconAssets() {
  const scanFiles = [
    ...listFiles(sourceRoot, (filePath) => /\.(ts|tsx|css)$/.test(filePath)),
    ...listTopLevelFiles(repositoryRoot, (filePath) => /\.(html|webmanifest|json)$/.test(filePath)),
    ...listFiles(publicRoot, (filePath) => /\.(webmanifest|json)$/.test(filePath))
  ];
  const found = new Map();
  const referencePattern = /(?:["'`(])((?:\/|\.\/)[^"'`)\s?]+\.(?:png|svg|webp|ico|jpe?g))(?:\?[^"'`)\s]*)?/gi;
  for (const filePath of scanFiles) {
    const text = readFileSync(filePath, "utf8");
    for (const match of text.matchAll(referencePattern)) {
      const rawReference = match[1];
      const normalized = rawReference.replace(/^\.\//, "").replace(/^\//, "");
      const context = text.slice(Math.max(0, match.index - 120), match.index + match[0].length + 120).toLowerCase();
      const iconLike =
        normalized.startsWith("icons/") ||
        normalized.includes("/icons/") ||
        /(?:^|[-_.])(icon|logo|favicon)(?:[-_.]|$)/i.test(basename(normalized)) ||
        normalized.includes("generated/ui/review-stamp-") ||
        normalized.endsWith("images/ac-cleaning.svg") ||
        /icon(src|source|path|image|url|\b)/i.test(context);
      if (iconLike && existsSync(join(publicRoot, normalized))) {
        const sourceReference = `${toPosix(relative(repositoryRoot, filePath))}:${text.slice(0, match.index).split("\n").length}`;
        found.set(normalized, sourceReference);
      }
    }
  }

  const specialBlackFile = join(sourceRoot, "components/mobile/SpecialBlackIcon.tsx");
  for (const name of collectTypeAliasStrings(specialBlackFile, "SpecialBlackIconName")) {
    found.set(`icons/special-black/${name}.png`, "SpecialBlackIconName");
  }
  for (const name of collectTypeAliasStrings(specialBlackFile, "SpecialBlackFlatIconName")) {
    found.set(`icons/special-black/flat/${name}.png`, "SpecialBlackFlatIconName");
  }

  for (const [assetPath, sourceReference] of [...found.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    addOriginalAsset(assetPath, sourceReference, `copied from a current icon reference at ${sourceReference}`);
  }
}

function csvCell(value) {
  const text = `${value ?? ""}`;
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function writeManifestFiles() {
  manifest.sort((a, b) => `${a.family}/${a.name}/${a.exportPath}`.localeCompare(`${b.family}/${b.name}/${b.exportPath}`));
  const formats = Object.fromEntries(
    [...new Set(manifest.map((entry) => entry.format))].sort().map((format) => [format, manifest.filter((entry) => entry.format === format).length])
  );
  const families = Object.fromEntries(
    [...new Set(manifest.map((entry) => entry.family))].sort().map((family) => [family, manifest.filter((entry) => entry.family === family).length])
  );
  const summary = {
    generatedAt: new Date().toISOString(),
    repository: repositoryRoot,
    total: manifest.length,
    formats,
    families
  };
  writeFileSync(join(outputRoot, "manifest.json"), `${JSON.stringify({ summary, icons: manifest }, null, 2)}\n`);
  const headers = ["id", "family", "name", "format", "exportPath", "source", "sourceLine", "variant", "notes"];
  const csv = [headers.join(","), ...manifest.map((entry) => headers.map((header) => csvCell(entry[header])).join(","))].join("\n");
  writeFileSync(join(outputRoot, "manifest.csv"), `${csv}\n`);
  return summary;
}

function writeGallery(summary) {
  const cards = manifest.map((entry) => {
    const assetUrl = encodeURI(entry.exportPath).replaceAll("#", "%23");
    return `<article class="card" data-family="${escapeHtml(entry.family)}" data-search="${escapeHtml(`${entry.family} ${entry.name} ${entry.source} ${entry.variant}`.toLowerCase())}">
      <div class="preview"><img alt="${escapeHtml(entry.name)}" loading="lazy" src="${assetUrl}"></div>
      <div class="meta"><strong>${escapeHtml(entry.name)}</strong><span>${escapeHtml(entry.family)} · ${escapeHtml(entry.format.toUpperCase())}</span><small>${escapeHtml(entry.source)}${entry.sourceLine ? `:${entry.sourceLine}` : ""}</small></div>
    </article>`;
  }).join("\n");
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>NeeDo 当前图标导出</title>
  <style>
    :root{color-scheme:light;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f6f8;color:#111827}
    *{box-sizing:border-box}body{margin:0}.top{position:sticky;top:0;z-index:5;padding:24px clamp(18px,4vw,56px);background:rgba(244,246,248,.92);border-bottom:1px solid #d9dee5;backdrop-filter:blur(18px)}
    h1{margin:0 0 8px;font-size:clamp(24px,4vw,42px)}p{margin:0;color:#5b6472}.search{margin-top:18px;width:min(680px,100%);height:46px;border:1px solid #c9d0d9;border-radius:14px;background:#fff;padding:0 16px;font-size:16px;outline:none}.search:focus{border-color:#3c887e;box-shadow:0 0 0 4px rgba(60,136,126,.13)}
    main{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;padding:24px clamp(18px,4vw,56px) 56px}.card{overflow:hidden;border:1px solid #d9dee5;border-radius:18px;background:#fff;box-shadow:0 8px 26px rgba(17,24,39,.06)}.preview{display:grid;height:150px;place-items:center;background:linear-gradient(45deg,#f5f7f9 25%,transparent 25%),linear-gradient(-45deg,#f5f7f9 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f5f7f9 75%),linear-gradient(-45deg,transparent 75%,#f5f7f9 75%);background-position:0 0,0 8px,8px -8px,-8px 0;background-size:16px 16px}.card[data-family="special-black"] .preview{background:radial-gradient(circle at 32% 18%,#273754,#111827 54%,#070b13)}.preview img{width:86px;height:86px;object-fit:contain}.meta{display:grid;gap:4px;padding:14px;border-top:1px solid #edf0f3}.meta strong{font-size:14px;overflow-wrap:anywhere}.meta span{font-size:12px;color:#3c887e}.meta small{font-size:10px;color:#7a8492;overflow-wrap:anywhere}.empty{display:none;padding:50px;text-align:center;color:#7a8492}
  </style>
</head>
<body>
  <header class="top"><h1>NeeDo 当前图标导出</h1><p>共 ${summary.total} 个导出条目；输入名称、家族或源文件即可筛选。</p><input class="search" id="search" placeholder="例如：calendar / IM / settings / category" autofocus></header>
  <main id="grid">${cards}</main><p class="empty" id="empty">没有匹配的图标</p>
  <script>const input=document.querySelector('#search');const cards=[...document.querySelectorAll('.card')];const empty=document.querySelector('#empty');input.addEventListener('input',()=>{const query=input.value.trim().toLowerCase();let shown=0;for(const card of cards){const visible=!query||card.dataset.search.includes(query);card.hidden=!visible;if(visible)shown++}empty.style.display=shown?'none':'block'});</script>
</body>
</html>`;
  writeFileSync(join(outputRoot, "index.html"), html);
}

function writeReadme(summary) {
  const familyLines = Object.entries(summary.families).map(([family, count]) => `- \`${family}\`: ${count}`).join("\n");
  const formatLines = Object.entries(summary.formats).map(([format, count]) => `- \`${format.toUpperCase()}\`: ${count}`).join("\n");
  const readme = `# NeeDo current icon export

This package was generated from the icon definitions and icon asset references in the current repository.

## Contents

- \`index.html\`: searchable visual contact sheet.
- \`manifest.csv\`: spreadsheet-friendly source inventory.
- \`manifest.json\`: machine-readable inventory and counts.
- \`svg/\`: standalone SVGs reconstructed from the current React/TSX icon definitions.
- \`original/\`: original referenced SVG/PNG/ICO/WebP files copied from \`public/\`.

## Totals

- Total export entries: ${summary.total}

Formats:

${formatLines}

Families:

${familyLines}

## Scope notes

- Small interface SVGs with a literal view box up to 64 x 64 are included.
- Large charts, maps, QR codes, mascots, photographs, avatars, backgrounds and service thumbnails are excluded because they are not interface icons.
- Category icon geometry is shared by all client themes. The standalone category SVGs use the current \`light-green\` palette; their source mapping remains in \`manifest.csv\`.
- \`currentColor\` SVGs intentionally keep their themeable color behavior. They render dark in the contact sheet and can be recolored by CSS or an SVG editor.
- Every item records its current source file so the export can be audited and regenerated.
`;
  writeFileSync(join(outputRoot, "README.md"), readme);
}

exportDirectInlineSvgs();
exportSwitchFamily({
  file: "src/components/client-ui/AppScaffold.tsx",
  functionName: "iconPath",
  family: "app-icon",
  viewBox: "0 0 24 24"
});
exportSwitchFamily({
  file: "src/components/mobile/MobileNavIcon.tsx",
  functionName: "MobileNavIcon",
  family: "mobile-nav",
  viewBox: "0 0 24 24"
});
exportSwitchFamily({
  file: "src/components/mobile/CategoryIcon.tsx",
  functionName: "renderIcon",
  family: "category",
  viewBox: "0 0 32 32",
  paletteVariable: "lightGreenPalette"
});
exportContactGroupFamily();
collectReferencedIconAssets();
const summary = writeManifestFiles();
writeGallery(summary);
writeReadme(summary);

console.log(JSON.stringify({ outputRoot, ...summary }, null, 2));
