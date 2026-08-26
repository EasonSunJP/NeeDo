import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

type RollbackBindingExpectation = {
  resolution: string;
  assertion: string;
  identifierBindings: Record<string, string>;
  stringBindings?: Record<string, string>;
};

const assertExactSnapshotReturnBindings = (
  sourceFile: ts.SourceFile,
  requiredFields: readonly string[]
): void => {
  const declaration = findNamedVariable(sourceFile, "captureRaceSnapshot");
  const initializer = declaration.initializer;
  if (
    !initializer ||
    (!ts.isArrowFunction(initializer) && !ts.isFunctionExpression(initializer)) ||
    !ts.isBlock(initializer.body)
  ) {
    throw new Error("captureRaceSnapshot must be a function with a block body");
  }
  const returns = initializer.body.statements.filter(ts.isReturnStatement);
  if (returns.length !== 1 || !returns[0].expression) {
    throw new Error("captureRaceSnapshot must have exactly one top-level return");
  }
  const returned = returns[0].expression;
  if (!ts.isObjectLiteralExpression(returned)) {
    throw new Error("captureRaceSnapshot must return an object literal");
  }
  if (returned.properties.length !== requiredFields.length) {
    throw new Error("captureRaceSnapshot return fields do not match the required snapshot");
  }
  const required = new Set(requiredFields);
  const seen = new Set<string>();
  for (const property of returned.properties) {
    if (
      (!ts.isShorthandPropertyAssignment(property) && !ts.isPropertyAssignment(property)) ||
      !property.name ||
      !ts.isIdentifier(property.name) ||
      !required.has(property.name.text) ||
      seen.has(property.name.text)
    ) {
      throw new Error("captureRaceSnapshot return contains a non-direct or unexpected property");
    }
    const field = property.name.text;
    seen.add(field);
    if (
      ts.isPropertyAssignment(property) &&
      (!ts.isIdentifier(property.initializer) || property.initializer.text !== field)
    ) {
      throw new Error(`captureRaceSnapshot must bind ${field} to the same-named identifier`);
    }
  }
  if (requiredFields.some((field) => !seen.has(field))) {
    throw new Error("captureRaceSnapshot return is missing a required field");
  }
};

const assertExactRollbackBinding = (
  sourceFile: ts.SourceFile,
  expectation: RollbackBindingExpectation
): void => {
  const declaration = findNamedVariable(sourceFile, expectation.resolution);
  let initializer = declaration.initializer;
  if (!initializer) throw new Error(`${expectation.resolution} initializer is missing`);
  if (ts.isAwaitExpression(initializer)) initializer = initializer.expression;
  if (
    !ts.isCallExpression(initializer) ||
    !ts.isIdentifier(initializer.expression) ||
    initializer.expression.text !== "resolveVerifiedDeadlockVictim" ||
    initializer.arguments.length !== 1 ||
    !ts.isObjectLiteralExpression(initializer.arguments[0])
  ) {
    throw new Error(
      `${expectation.resolution} must directly call resolveVerifiedDeadlockVictim with an object literal`
    );
  }
  const resolutionInput = initializer.arguments[0];
  const resolutionFields = new Set<string>();
  for (const property of resolutionInput.properties) {
    if (
      (!ts.isShorthandPropertyAssignment(property) && !ts.isPropertyAssignment(property)) ||
      !property.name ||
      !ts.isIdentifier(property.name) ||
      resolutionFields.has(property.name.text)
    ) {
      throw new Error(`${expectation.resolution} resolution input has an indirect property`);
    }
    resolutionFields.add(property.name.text);
  }
  const rollbackProperties = resolutionInput.properties.filter(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) &&
      ts.isIdentifier(property.name) &&
      property.name.text === "verifyRollback"
  );
  if (rollbackProperties.length !== 1) {
    throw new Error(`${expectation.resolution} must define one direct verifyRollback property`);
  }
  const rollback = rollbackProperties[0].initializer;
  if (
    (!ts.isArrowFunction(rollback) && !ts.isFunctionExpression(rollback)) ||
    !rollback.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ||
    !ts.isBlock(rollback.body)
  ) {
    throw new Error(`${expectation.resolution} verifyRollback must be an async function block`);
  }
  if (callbackShadowsIdentifier(rollback, expectation.assertion)) {
    throw new Error(`${expectation.resolution} verifyRollback shadows ${expectation.assertion}`);
  }
  const directCalls = rollback.body.statements.flatMap((statement, index) => {
    if (!ts.isExpressionStatement(statement) || !ts.isAwaitExpression(statement.expression)) {
      return [];
    }
    const awaited = statement.expression.expression;
    const matches =
      ts.isCallExpression(awaited) &&
      ts.isIdentifier(awaited.expression) &&
      awaited.expression.text === expectation.assertion;
    return matches ? [{ statement, index }] : [];
  });
  if (directCalls.length !== 1) {
    throw new Error(
      `${expectation.resolution} verifyRollback must directly await ${expectation.assertion} exactly once`
    );
  }
  if (
    rollback.body.statements
      .slice(0, directCalls[0].index)
      .some((statement) => ts.isReturnStatement(statement) || ts.isThrowStatement(statement))
  ) {
    throw new Error(
      `${expectation.resolution} verifyRollback must not return or throw before ${expectation.assertion}`
    );
  }
  const awaited = directCalls[0].statement.expression;
  if (!ts.isAwaitExpression(awaited) || !ts.isCallExpression(awaited.expression)) {
    throw new Error(`${expectation.resolution} rollback assertion is not directly awaited`);
  }
  const call = awaited.expression;
  if (call.arguments.length !== 1 || !ts.isObjectLiteralExpression(call.arguments[0])) {
    throw new Error(`${expectation.resolution} rollback assertion requires an object literal`);
  }
  const argument = call.arguments[0];
  const expectedFields = {
    ...expectation.identifierBindings,
    ...(expectation.stringBindings ?? {})
  };
  if (argument.properties.length !== Object.keys(expectedFields).length) {
    throw new Error(`${expectation.resolution} rollback assertion fields are not exact`);
  }
  const properties = new Map<string, ts.ShorthandPropertyAssignment | ts.PropertyAssignment>();
  for (const property of argument.properties) {
    if (
      (!ts.isShorthandPropertyAssignment(property) && !ts.isPropertyAssignment(property)) ||
      !property.name ||
      !ts.isIdentifier(property.name) ||
      properties.has(property.name.text)
    ) {
      throw new Error(`${expectation.resolution} rollback assertion has a non-direct property`);
    }
    properties.set(property.name.text, property);
  }
  for (const [field, expectedIdentifier] of Object.entries(expectation.identifierBindings)) {
    const property = properties.get(field);
    const actualIdentifier = property && identifierBoundBy(property);
    if (actualIdentifier !== expectedIdentifier) {
      throw new Error(`${expectation.resolution} ${field} must bind ${expectedIdentifier}`);
    }
  }
  for (const [field, expectedValue] of Object.entries(expectation.stringBindings ?? {})) {
    const property = properties.get(field);
    if (
      !property ||
      !ts.isPropertyAssignment(property) ||
      !ts.isStringLiteral(property.initializer) ||
      property.initializer.text !== expectedValue
    ) {
      throw new Error(`${expectation.resolution} ${field} must equal ${expectedValue}`);
    }
  }
};

const findNamedVariable = (sourceFile: ts.SourceFile, name: string): ts.VariableDeclaration => {
  const matches: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (matches.length !== 1) throw new Error(`expected exactly one variable named ${name}`);
  return matches[0];
};

const identifierBoundBy = (
  property: ts.ShorthandPropertyAssignment | ts.PropertyAssignment
): string | null => {
  if (ts.isShorthandPropertyAssignment(property)) return property.name.text;
  return ts.isIdentifier(property.initializer) ? property.initializer.text : null;
};

const bindingNameIncludes = (binding: ts.BindingName, identifier: string): boolean => {
  if (ts.isIdentifier(binding)) return binding.text === identifier;
  return binding.elements.some(
    (element) => !ts.isOmittedExpression(element) && bindingNameIncludes(element.name, identifier)
  );
};

const callbackShadowsIdentifier = (
  callback: ts.ArrowFunction | ts.FunctionExpression,
  identifier: string
): boolean => {
  if (callback.parameters.some((parameter) => bindingNameIncludes(parameter.name, identifier))) {
    return true;
  }
  let shadowed = false;
  const visit = (node: ts.Node): void => {
    if (shadowed) return;
    if (ts.isVariableDeclaration(node)) {
      shadowed = bindingNameIncludes(node.name, identifier);
      return;
    }
    if (ts.isFunctionDeclaration(node)) {
      shadowed = node.name?.text === identifier;
      return;
    }
    if (ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)) {
      shadowed = node.name?.text === identifier;
      return;
    }
    if (ts.isCatchClause(node)) {
      shadowed =
        node.variableDeclaration !== undefined &&
        bindingNameIncludes(node.variableDeclaration.name, identifier);
      if (!shadowed) ts.forEachChild(node.block, visit);
      return;
    }
    if (ts.isImportDeclaration(node)) {
      const importClause = node.importClause;
      shadowed =
        importClause?.name?.text === identifier ||
        (importClause?.namedBindings !== undefined &&
          (ts.isNamespaceImport(importClause.namedBindings)
            ? importClause.namedBindings.name.text === identifier
            : importClause.namedBindings.elements.some(
                (element) => element.name.text === identifier
              )));
      return;
    }
    if (ts.isImportEqualsDeclaration(node)) {
      shadowed = node.name.text === identifier;
      return;
    }
    if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) return;
    ts.forEachChild(node, visit);
  };
  visit(callback.body);
  return shadowed;
};

const assertBaselineTimelineArrayGuard = (sourceFile: ts.SourceFile): void => {
  const declaration = findNamedVariable(sourceFile, "assertTimelineAppend");
  const initializer = declaration.initializer;
  if (!initializer || !ts.isArrowFunction(initializer) || !ts.isBlock(initializer.body)) {
    throw new Error("assertTimelineAppend must be an arrow function block");
  }
  const guardIndexes = initializer.body.statements.flatMap((statement, index) => {
    if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) {
      return [];
    }
    const call = statement.expression;
    if (
      !ts.isIdentifier(call.expression) ||
      call.expression.text !== "assert" ||
      call.arguments.length !== 2
    ) {
      return [];
    }
    const condition = call.arguments[0];
    const message = call.arguments[1];
    const exactCondition =
      ts.isCallExpression(condition) &&
      ts.isPropertyAccessExpression(condition.expression) &&
      ts.isIdentifier(condition.expression.expression) &&
      condition.expression.expression.text === "Array" &&
      condition.expression.name.text === "isArray" &&
      condition.arguments.length === 1 &&
      ts.isIdentifier(condition.arguments[0]) &&
      condition.arguments[0].text === "baselineTimeline";
    const exactMessage =
      ts.isTemplateExpression(message) &&
      message.head.text === "" &&
      message.templateSpans.length === 1 &&
      ts.isIdentifier(message.templateSpans[0].expression) &&
      message.templateSpans[0].expression.text === "label" &&
      message.templateSpans[0].literal.text === " baseline timeline is not an array";
    return exactCondition && exactMessage ? [index] : [];
  });
  if (guardIndexes.length !== 1) {
    throw new Error("assertTimelineAppend must directly guard baselineTimeline as an array once");
  }
  const baselineRowsDeclarations = initializer.body.statements.flatMap((statement, index) => {
    if (!ts.isVariableStatement(statement)) return [];
    return statement.declarationList.declarations.flatMap((row) =>
      ts.isIdentifier(row.name) && row.name.text === "baselineRows" ? [{ row, index }] : []
    );
  });
  if (
    baselineRowsDeclarations.length !== 1 ||
    !baselineRowsDeclarations[0].row.initializer ||
    !ts.isIdentifier(baselineRowsDeclarations[0].row.initializer) ||
    baselineRowsDeclarations[0].row.initializer.text !== "baselineTimeline" ||
    baselineRowsDeclarations[0].index <= guardIndexes[0]
  ) {
    throw new Error("baselineRows must directly use guarded baselineTimeline");
  }
};

const parseFixture = (source: string): ts.SourceFile =>
  ts.createSourceFile("fixture.ts", source, ts.ScriptTarget.Latest, true);

describe("affiliate task expiry local MySQL acceptance script", () => {
  it("is registered, guarded, marker-owned, and covers expiry release invariants", () => {
    const backendRoot = join(__dirname, "..");
    const packageJson = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const scriptPath = join(backendRoot, "scripts/check-affiliate-task-expiry-flow.ts");

    expect(existsSync(scriptPath)).toBe(true);
    expect(packageJson.scripts["check:affiliate-task-expiry-flow"]).toBe(
      "tsx scripts/check-affiliate-task-expiry-flow.ts"
    );

    const source = readFileSync(scriptPath, "utf8");
    expect(source).toContain("assertSafeAffiliateCompletionDatabase");
    expect(source).toContain("AffiliateTaskExpiryRepository");
    expect(source).toContain("AffiliateTaskExpiryService");
    expect(source).toContain("affiliate-expiry-acceptance-guard");
    expect(source).toContain("FixtureOwnedAffiliateTaskExpiryRepository");
    expect(source).toContain("resolveVerifiedDeadlockVictim");
    expect(source).toContain("requireSuccessfulExpirySummary");
    expect(source).toContain("allowedTaskIds");
    expect(source).toContain("LedgerRepository");
    expect(source).toContain("LedgerService");
    expect(source).toContain("AffiliateCheckoutRepository");
    expect(source).toContain("AffiliateCheckoutService");
    expect(source).toContain("AffiliateLinkTokenService");
    expect(source).toContain("BookingRepository");
    expect(source).toContain("BookingService");
    expect(source).toContain("FeeRuleRepository");
    expect(source).toContain("FeeCalculationService");
    expect(source).toContain("affiliate-task-expiry-${Date.now()}");
    expect(source).toContain("affiliate_task_budget_release");
    expect(source).toContain("deliberately NOT allowed due sentinel");
    expect(source).toContain("sentinel refusal mutated fixture state");
    expect(source).toContain("sentinelRefusedBeforeMutation");
    expect(source).toContain("fully unallocated due task");
    expect(source).toContain("partially allocated and captured due task");
    expect(source).toContain("ended task later incremental release");
    expect(source).toContain("createAttributedOrder");
    expect(source).toContain("settleCompletedBooking");
    expect(source).toContain("invalidateCancelledBooking");
    expect(source).toContain("AffiliateAttribution");
    expect(source).toContain("ATTRIBUTED");
    expect(source).toContain("SETTLED");
    expect(source).toContain("INVALIDATED");
    expect(source).toContain("completion expiry race");
    expect(source).toContain("cancellation expiry race");
    expect(source).toContain("advanceToInService(customerCompletionRace.id");
    expect(source).toMatch(
      /completionRuns = await Promise\.allSettled\([\s\S]{0,500}booking\.transitionOrder\([\s\S]{0,200}"complete"/
    );
    expect(source).toMatch(
      /cancellationRuns = await Promise\.allSettled\([\s\S]{0,500}booking\.transitionOrder\([\s\S]{0,200}"cancel"/
    );
    expect(source).not.toMatch(
      /completionRuns = await Promise\.allSettled\([\s\S]{0,500}settleCompletedBooking/
    );
    expect(source).not.toMatch(
      /cancellationRuns = await Promise\.allSettled\([\s\S]{0,500}invalidateCancelledBooking/
    );
    expect(source).toContain("completionBooking");
    expect(source).toContain("completionHistory");
    expect(source).toContain("completionSlot");
    expect(source).toContain("completionHold");
    expect(source).toContain("completionFinancial");
    expect(source).toContain("completionBookingLedgers");
    expect(source).toContain("cancellationBooking");
    expect(source).toContain("cancellationHistory");
    expect(source).toContain("cancellationSlot");
    expect(source).toContain("cancellationHold");
    expect(source).toContain("cancellationFinancial");
    expect(source).toContain("cancellationBookingLedgers");
    expect(source).toContain("captureRaceSnapshot");
    expect(source).toContain("assertExpiryVictimRollback");
    expect(source).toContain("assertBookingVictimRollback");
    expect(source).toContain("completionPreRaceSnapshot");
    expect(source).toContain("cancellationPreRaceSnapshot");
    const sourceFile = ts.createSourceFile(scriptPath, source, ts.ScriptTarget.Latest, true);
    assertExactSnapshotReturnBindings(sourceFile, [
      "bookingOrder",
      "statusHistory",
      "scheduleSlot",
      "walletHolds",
      "orderFinancial",
      "feeCalculationLogs",
      "bookingLedgers",
      "affiliateTask",
      "budgetReservation",
      "publisherWallet",
      "claimantWallet",
      "customerWallet",
      "affiliateClaim",
      "attribution",
      "affiliateRewards",
      "affiliateLedgers",
      "riskEvents",
      "auditLogs"
    ]);
    assertBaselineTimelineArrayGuard(sourceFile);
    expect(source).toContain("expiry winner was not fully committed");
    expect(source).toContain("formal completion winner was not fully committed");
    expect(source).toContain("formal cancellation winner was not fully committed");
    expect(source).toContain("expiry victim left partial artifacts");
    expect(source).toContain("booking victim left partial artifacts");
    expect(source).toContain("completionReleaseLedgers");
    expect(source).toContain('completionState.reservation.status === "RELEASED"');
    expect(source).toContain('cancellationState.reservation.status === "RELEASED"');
    expect(source).toContain("deadlock");
    expect(source).toContain("immutable endedAt");
    expect(source).toContain("activeKey === null");
    expect(source).toContain("affiliate.reward.settled");
    expect(source).toContain("affiliate.attribution.invalidated");
    expect(source).toContain("AFFILIATE_REWARD_SETTLEMENT");
    expect(source).toContain("AffiliateRewardTransaction");
    expect(source).toContain(
      "zero-unallocated task did not create an empty release ledger transaction"
    );
    expect(source).toContain("walletBeforeExpiry");
    expect(source).toContain("initial expiry wallet delta is incorrect");
    expect(source).toContain("first incremental expiry did not preserve the actual ATTRIBUTED row");
    expect(source).toContain(
      "ended task later incremental release did not preserve cumulative budget state"
    );
    expect(source).toContain("concurrent expiry wallet delta is incorrect");
    expect(source).toContain("totalBudgetNdp === 1_000");
    expect(source).toContain("reservedBudgetNdp === 1_000");
    expect(source).toContain("totalFrozenNdp === 1_000");
    expect(source).toContain("totalBudgetNdp === 2_000");
    expect(source).toContain("reservedBudgetNdp === 2_000");
    expect(source).toContain("totalFrozenNdp === 2_000");
    expect(source).toContain("totalBudgetNdp === 1_200");
    expect(source).toMatch(
      /fullState\.task\.totalBudgetNdp === 1_000[\s\S]*fullState\.task\.reservedBudgetNdp === 1_000[\s\S]*fullState\.task\.allocatedBudgetNdp === 0[\s\S]*fullState\.task\.settledBudgetNdp === 0[\s\S]*fullState\.task\.releasedBudgetNdp === 1_000[\s\S]*fullState\.reservation\.totalFrozenNdp === 1_000[\s\S]*fullState\.reservation\.allocatedNdp === 0[\s\S]*fullState\.reservation\.capturedNdp === 0[\s\S]*fullState\.reservation\.releasedNdp === 1_000/
    );
    expect(source).toMatch(
      /zeroState\.task\.totalBudgetNdp === REWARD_NDP[\s\S]*zeroState\.task\.allocatedBudgetNdp === 0[\s\S]*zeroState\.task\.settledBudgetNdp === REWARD_NDP[\s\S]*zeroState\.task\.releasedBudgetNdp === 0[\s\S]*zeroState\.reservation\.totalFrozenNdp === REWARD_NDP[\s\S]*zeroState\.reservation\.allocatedNdp === 0[\s\S]*zeroState\.reservation\.capturedNdp === REWARD_NDP[\s\S]*zeroState\.reservation\.releasedNdp === 0/
    );
    expect(source).toMatch(
      /partialState\.task\.totalBudgetNdp === 2_000[\s\S]*partialState\.task\.reservedBudgetNdp === 2_000[\s\S]*partialState\.task\.allocatedBudgetNdp === REWARD_NDP[\s\S]*partialState\.task\.settledBudgetNdp === REWARD_NDP[\s\S]*partialState\.task\.releasedBudgetNdp === 1_000[\s\S]*partialState\.reservation\.totalFrozenNdp === 2_000[\s\S]*partialState\.reservation\.allocatedNdp === REWARD_NDP[\s\S]*partialState\.reservation\.capturedNdp === REWARD_NDP[\s\S]*partialState\.reservation\.releasedNdp === 1_000/
    );
    expect(source).toMatch(
      /incrementalState\.task\.totalBudgetNdp === 1_200[\s\S]*incrementalState\.task\.allocatedBudgetNdp === 0[\s\S]*incrementalState\.task\.settledBudgetNdp === 0[\s\S]*incrementalState\.task\.releasedBudgetNdp === 1_200[\s\S]*incrementalState\.reservation\.allocatedNdp === 0[\s\S]*incrementalState\.reservation\.capturedNdp === 0[\s\S]*incrementalState\.reservation\.releasedNdp === 1_200/
    );
    expect(source).toMatch(
      /concurrentState\.task\.totalBudgetNdp === 1_000[\s\S]*concurrentState\.task\.reservedBudgetNdp === 1_000[\s\S]*concurrentState\.task\.allocatedBudgetNdp === 0[\s\S]*concurrentState\.task\.settledBudgetNdp === 0[\s\S]*concurrentState\.task\.releasedBudgetNdp === 1_000[\s\S]*concurrentState\.reservation\.totalFrozenNdp === 1_000[\s\S]*concurrentState\.reservation\.allocatedNdp === 0[\s\S]*concurrentState\.reservation\.capturedNdp === 0[\s\S]*concurrentState\.reservation\.releasedNdp === 1_000/
    );
    expect(source).toContain("Promise.allSettled");
    expect(source).toContain("concurrentFailures");
    expect(source).toContain("run.value.failed === 0");
    expect(source).toContain("concurrentFailures.length === 0");
    expect(source).toContain("run.value.released : 0");
    expect(source).toContain("isolation");
    expect(source).toContain("attributionPreservation");
    expect(source).toContain("completionRace");
    expect(source).toContain("cancellationRace");
    expect(source).toContain("marker cleanup left affiliate expiry rows behind");
    expect(source).toContain("walletHold.deleteMany");
    expect(source).toContain("orderFinancial.deleteMany");
    expect(source).toContain("feeCalculationLog.deleteMany");
    expect(source).toContain("prisma.wallet.count");
    expect(source).toContain("prisma.affiliateRiskEvent.count");
    expect(source).toContain("prisma.affiliateTaskService.count");
    expect(source).toContain("prisma.affiliateTaskShop.count");
    const cleanupCountSource = source.slice(source.indexOf("const cleanupCounts"));
    const deletedModels = new Set(
      [...source.matchAll(/transaction\.(\w+)\.deleteMany\(/g)].map((match) => match[1])
    );
    for (const deletedModel of deletedModels) {
      expect(cleanupCountSource).toContain(`prisma.${deletedModel}.count`);
    }
    expect(source).toContain("platformFeeRule.deleteMany");
    expect(source).toContain("platformFeeRuleSet.deleteMany");
    expect(source).toContain("finally");
    expect(source).not.toMatch(/affiliateTask\.update\([\s\S]{0,300}allocatedBudgetNdp:\s*0/);
    expect(source).not.toMatch(
      /affiliateBudgetReservation\.update\([\s\S]{0,300}allocatedNdp:\s*0/
    );
    expect(source).not.toContain("deleteMany({})");
  });

  it("binds every deadlock callback to its exact snapshot and race time bounds", () => {
    const scriptPath = join(__dirname, "..", "scripts/check-affiliate-task-expiry-flow.ts");
    const source = readFileSync(scriptPath, "utf8");
    const sourceFile = ts.createSourceFile(scriptPath, source, ts.ScriptTarget.Latest, true);
    const expectations: RollbackBindingExpectation[] = [
      {
        resolution: "completionExpiryResolution",
        assertion: "assertExpiryVictimRollback",
        identifierBindings: {
          baseline: "completionPreRaceSnapshot",
          snapshotInput: "completionSnapshotInput",
          raceStartedAt: "completionRaceStartedAt",
          raceSettledAt: "completionRaceSettledAt"
        },
        stringBindings: { flow: "completion" }
      },
      {
        resolution: "completionFormalResolution",
        assertion: "assertBookingVictimRollback",
        identifierBindings: {
          baseline: "completionPreRaceSnapshot",
          snapshotInput: "completionSnapshotInput",
          raceStartedAt: "completionRaceStartedAt",
          raceSettledAt: "completionRaceSettledAt"
        }
      },
      {
        resolution: "cancellationExpiryResolution",
        assertion: "assertExpiryVictimRollback",
        identifierBindings: {
          baseline: "cancellationPreRaceSnapshot",
          snapshotInput: "cancellationSnapshotInput",
          raceStartedAt: "cancellationRaceStartedAt",
          raceSettledAt: "cancellationRaceSettledAt"
        },
        stringBindings: { flow: "cancellation" }
      },
      {
        resolution: "cancellationFormalResolution",
        assertion: "assertBookingVictimRollback",
        identifierBindings: {
          baseline: "cancellationPreRaceSnapshot",
          snapshotInput: "cancellationSnapshotInput",
          raceStartedAt: "cancellationRaceStartedAt",
          raceSettledAt: "cancellationRaceSettledAt"
        }
      }
    ];

    for (const expected of expectations) {
      assertExactRollbackBinding(sourceFile, expected);
    }
  });
});

describe("affiliate expiry AST contract helpers", () => {
  it.each([
    "return { ...snapshot };",
    'return { "riskEvents": riskEvents };',
    "return { [field]: riskEvents };",
    "return { riskEvents() { return []; } };"
  ])("rejects a non-direct capture snapshot property: %s", (returned) => {
    const fixture = parseFixture(`
      const captureRaceSnapshot = async () => {
        const field = "riskEvents";
        const riskEvents = [];
        const snapshot = { riskEvents };
        ${returned}
      };
    `);

    expect(() => assertExactSnapshotReturnBindings(fixture, ["riskEvents"])).toThrow();
  });

  it("rejects a capture snapshot field aliased to the wrong identifier", () => {
    const fixture = parseFixture(`
      const captureRaceSnapshot = async () => {
        const riskEvents = [];
        const auditLogs = [];
        return { riskEvents: auditLogs };
      };
    `);

    expect(() => assertExactSnapshotReturnBindings(fixture, ["riskEvents"])).toThrow(
      "captureRaceSnapshot must bind riskEvents to the same-named identifier"
    );
  });

  it("rejects the wrong snapshot identifier in a rollback assertion", () => {
    const fixture = parseFixture(`
      const completionExpiryResolution = await resolveVerifiedDeadlockVictim({
        verifyRollback: async () => {
          await assertExpiryVictimRollback({
            flow: "completion",
            baseline: cancellationPreRaceSnapshot,
            snapshotInput: completionSnapshotInput,
            raceStartedAt: completionRaceStartedAt,
            raceSettledAt: completionRaceSettledAt
          });
        }
      });
    `);

    expect(() =>
      assertExactRollbackBinding(fixture, {
        resolution: "completionExpiryResolution",
        assertion: "assertExpiryVictimRollback",
        identifierBindings: {
          baseline: "completionPreRaceSnapshot",
          snapshotInput: "completionSnapshotInput",
          raceStartedAt: "completionRaceStartedAt",
          raceSettledAt: "completionRaceSettledAt"
        },
        stringBindings: { flow: "completion" }
      })
    ).toThrow("completionExpiryResolution baseline must bind completionPreRaceSnapshot");
  });

  it("rejects a rollback assertion hidden in a nested dead branch", () => {
    const fixture = parseFixture(`
      const completionExpiryResolution = await resolveVerifiedDeadlockVictim({
        verifyRollback: async () => {
          if (false) {
            await assertExpiryVictimRollback({
              flow: "completion",
              baseline: completionPreRaceSnapshot,
              snapshotInput: completionSnapshotInput,
              raceStartedAt: completionRaceStartedAt,
              raceSettledAt: completionRaceSettledAt
            });
          }
        }
      });
    `);

    expect(() =>
      assertExactRollbackBinding(fixture, {
        resolution: "completionExpiryResolution",
        assertion: "assertExpiryVictimRollback",
        identifierBindings: {
          baseline: "completionPreRaceSnapshot",
          snapshotInput: "completionSnapshotInput",
          raceStartedAt: "completionRaceStartedAt",
          raceSettledAt: "completionRaceSettledAt"
        },
        stringBindings: { flow: "completion" }
      })
    ).toThrow(
      "completionExpiryResolution verifyRollback must directly await assertExpiryVictimRollback exactly once"
    );
  });

  it("rejects a spread that can override the direct rollback callback", () => {
    const fixture = parseFixture(`
      const override = { verifyRollback: async () => undefined };
      const completionExpiryResolution = await resolveVerifiedDeadlockVictim({
        verifyRollback: async () => {
          await assertExpiryVictimRollback({
            flow: "completion",
            baseline: completionPreRaceSnapshot,
            snapshotInput: completionSnapshotInput,
            raceStartedAt: completionRaceStartedAt,
            raceSettledAt: completionRaceSettledAt
          });
        },
        ...override
      });
    `);

    expect(() =>
      assertExactRollbackBinding(fixture, {
        resolution: "completionExpiryResolution",
        assertion: "assertExpiryVictimRollback",
        identifierBindings: {
          baseline: "completionPreRaceSnapshot",
          snapshotInput: "completionSnapshotInput",
          raceStartedAt: "completionRaceStartedAt",
          raceSettledAt: "completionRaceSettledAt"
        },
        stringBindings: { flow: "completion" }
      })
    ).toThrow("completionExpiryResolution resolution input has an indirect property");
  });

  it.each(["return;", 'throw new Error("stop");'])(
    "rejects an assertion made unreachable by a preceding %s",
    (terminator) => {
      const fixture = parseFixture(`
        const completionExpiryResolution = await resolveVerifiedDeadlockVictim({
          verifyRollback: async () => {
            ${terminator}
            await assertExpiryVictimRollback({
              flow: "completion",
              baseline: completionPreRaceSnapshot,
              snapshotInput: completionSnapshotInput,
              raceStartedAt: completionRaceStartedAt,
              raceSettledAt: completionRaceSettledAt
            });
          }
        });
      `);

      expect(() =>
        assertExactRollbackBinding(fixture, {
          resolution: "completionExpiryResolution",
          assertion: "assertExpiryVictimRollback",
          identifierBindings: {
            baseline: "completionPreRaceSnapshot",
            snapshotInput: "completionSnapshotInput",
            raceStartedAt: "completionRaceStartedAt",
            raceSettledAt: "completionRaceSettledAt"
          },
          stringBindings: { flow: "completion" }
        })
      ).toThrow(
        "completionExpiryResolution verifyRollback must not return or throw before assertExpiryVictimRollback"
      );
    }
  );

  it.each([
    "const assertExpiryVictimRollback = async () => undefined;",
    "function assertExpiryVictimRollback() { return undefined; }",
    "const { assertExpiryVictimRollback } = helpers;"
  ])("rejects a callback-local assertion shadow: %s", (shadow) => {
    const fixture = parseFixture(`
      const completionExpiryResolution = await resolveVerifiedDeadlockVictim({
        verifyRollback: async () => {
          ${shadow}
          await assertExpiryVictimRollback({
            flow: "completion",
            baseline: completionPreRaceSnapshot,
            snapshotInput: completionSnapshotInput,
            raceStartedAt: completionRaceStartedAt,
            raceSettledAt: completionRaceSettledAt
          });
        }
      });
    `);

    expect(() =>
      assertExactRollbackBinding(fixture, {
        resolution: "completionExpiryResolution",
        assertion: "assertExpiryVictimRollback",
        identifierBindings: {
          baseline: "completionPreRaceSnapshot",
          snapshotInput: "completionSnapshotInput",
          raceStartedAt: "completionRaceStartedAt",
          raceSettledAt: "completionRaceSettledAt"
        },
        stringBindings: { flow: "completion" }
      })
    ).toThrow("completionExpiryResolution verifyRollback shadows assertExpiryVictimRollback");
  });
});
