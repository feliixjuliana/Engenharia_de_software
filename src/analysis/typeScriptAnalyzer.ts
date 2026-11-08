import * as ts from 'typescript';
import { FileRecord, SourcePosition } from './models';

/** Parses supplied text only; never creates a filesystem-backed CompilerHost. */
export class TypeScriptAnalyzer {
  analyze(file: FileRecord): void {
    if (!['JavaScript', 'TypeScript', 'JSON'].includes(file.language)) { return; }
    const source = file.language === 'JSON'
      ? ts.parseJsonText(file.path, file.content)
      : ts.createSourceFile(file.path, file.content, ts.ScriptTarget.Latest, true);
    const position = (node: ts.Node): SourcePosition => ({
      path: file.path,
      startLine: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      endLine: source.getLineAndCharacterOfPosition(Math.max(node.getStart(source), node.getEnd() - 1)).line + 1
    });
    // parseDiagnostics is available on parser results, though not on the public SourceFile interface.
    const diagnostics = (source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
    for (const diagnostic of diagnostics) {
      const line = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1;
      file.errors.push(`${file.path}:${line}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
    }
    const textName = (node: ts.Node & { name?: ts.Node }): string => node.name?.getText(source) ?? '(anônimo)';
    const addReference = (node: ts.Node, value: ts.Node | undefined, kind: string): void => {
      if (value && ts.isStringLiteralLike(value)) {
        file.imports.push({ ...position(node), specifier: value.text, kind });
      }
    };
    const visit = (node: ts.Node): void => {
      let kind: string | undefined;
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) { kind = 'class'; }
      else if (ts.isInterfaceDeclaration(node)) { kind = 'interface'; }
      else if (ts.isFunctionDeclaration(node)) { kind = 'function'; }
      else if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) { kind = 'method'; }
      else if (ts.isConstructorDeclaration(node)) { kind = 'constructor'; }
      else if (ts.isGetAccessor(node) || ts.isSetAccessor(node)) { kind = 'accessor'; }
      else if (ts.isTypeAliasDeclaration(node)) { kind = 'type'; }
      else if (ts.isEnumDeclaration(node)) { kind = 'enum'; }
      else if (ts.isVariableDeclaration(node)) {
        const isFunction = node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer));
        if (isFunction || (ts.isVariableDeclarationList(node.parent) && ts.isVariableStatement(node.parent.parent)
          && ts.isSourceFile(node.parent.parent.parent))) {
          kind = isFunction ? 'function' : (node.parent.flags & ts.NodeFlags.Const) ? 'constant' : 'variable';
        }
      } else if (ts.isPropertyDeclaration(node) && node.initializer &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) { kind = 'method'; }
      if (kind) {
        const name = ts.isConstructorDeclaration(node) ? 'constructor' : textName(node as ts.Node & { name?: ts.Node });
        const parent = node.parent;
        const owner = parent && (ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent) || ts.isClassExpression(parent))
          ? textName(parent) : undefined;
        file.symbols.push({ ...position(node), name: owner ? `${owner}.${name}` : name, kind });
      }
      if (ts.isImportDeclaration(node)) { addReference(node, node.moduleSpecifier, 'import'); }
      if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        addReference(node, node.moduleReference.expression, 'import-equals');
      }
      if (ts.isExportDeclaration(node)) {
        addReference(node, node.moduleSpecifier, 're-export');
        file.exports.push({ ...position(node), name: node.exportClause?.getText(source) ?? '*', kind: 'export' });
      }
      if (ts.isExportAssignment(node)) { file.exports.push({ ...position(node), name: node.expression.getText(source), kind: 'export-assignment' }); }
      if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(item => item.kind === ts.SyntaxKind.ExportKeyword)) {
        file.exports.push({ ...position(node), name: ts.isVariableStatement(node)
          ? node.declarationList.declarations.map(item => item.name.getText(source)).join(', ')
          : textName(node as ts.Node & { name?: ts.Node }), kind: 'export' });
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
        addReference(node, node.arguments[0], node.expression.kind === ts.SyntaxKind.ImportKeyword ? 'dynamic-import' : 'require');
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        /^(?:module\.exports(?:\.|\[|$)|exports(?:\.|\[))/.test(node.left.getText(source))) {
        file.exports.push({ ...position(node), name: node.left.getText(source), kind: 'commonjs-export' });
      }
      ts.forEachChild(node, visit);
    };
    if (file.language !== 'JSON') {
      visit(source);
      if (/(?:^|\/)(?:index|main|app|server)\.[cm]?[jt]sx?$/.test(file.path)) {
        file.entryPoints.push({ path: file.path, startLine: 1, endLine: 1, value: file.path, reason: 'Convenção de nome; candidato, sem confirmação de execução' });
      }
      return;
    }
    let json: unknown;
    try { json = JSON.parse(file.content); }
    catch (error) { file.errors.push(`${file.path}: JSON inválido: ${String(error)}`); return; }
    if (!/(?:^|\/)package\.json$/.test(file.path) || !json || typeof json !== 'object' || Array.isArray(json)) { return; }
    // Read values from the JSON AST to preserve exact source lines.
    const first = source.statements[0];
    const root = first && ts.isExpressionStatement(first) ? first.expression : undefined;
    if (!root || !ts.isObjectLiteralExpression(root)) { return; }
    for (const property of root.properties) {
      if (!ts.isPropertyAssignment(property)) { continue; }
      const key = ts.isStringLiteralLike(property.name) ? property.name.text : property.name.getText(source);
      if (['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].includes(key)
        && ts.isObjectLiteralExpression(property.initializer)) {
        for (const dependency of property.initializer.properties) {
          if (ts.isPropertyAssignment(dependency) && ts.isStringLiteralLike(dependency.initializer)) {
            const name = ts.isStringLiteralLike(dependency.name) ? dependency.name.text : dependency.name.getText(source);
            file.dependencies.push({ ...position(dependency), name, version: dependency.initializer.text, group: key });
          }
        }
      }
      if (['main', 'module', 'bin', 'exports', 'browser'].includes(key)) {
        const collect = (node: ts.Node): void => {
          if (ts.isStringLiteralLike(node)) {
            file.entryPoints.push({ ...position(node), value: node.text, reason: `Declaração package.json:${key}; não executada` });
          } else if (ts.isPropertyAssignment(node)) { collect(node.initializer); }
          else { ts.forEachChild(node, collect); }
        };
        collect(property.initializer);
      }
    }
  }
}