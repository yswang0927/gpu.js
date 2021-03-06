const { utils } = require('../utils');

function last(array) {
  return array.length > 0 ? array[array.length - 1] : null;
}

class FunctionTracer {
  constructor(ast) {
    this.runningContexts = [];
    this.functionContexts = [];
    this.contexts = [];
    this.functionCalls = [];
    this.declarations = [];
    this.identifiers = [];
    this.functions = [];
    this.returnStatements = [];
    this.inLoopInit = false;
    this.newFunctionContext();
    this.scan(ast);
  }

  get currentFunctionContext() {
    return last(this.functionContexts);
  }

  get currentContext() {
    return last(this.runningContexts);
  }

  newFunctionContext() {
    const newContext = { '@contextType': 'var' };
    this.contexts.push(newContext);
    this.functionContexts.push(newContext);
  }

  newContext(run) {
    const newContext = Object.assign({ '@contextType': 'var/const/let' }, this.currentContext);
    this.contexts.push(newContext);
    this.runningContexts.push(newContext);
    run();
    const { currentFunctionContext } = this;
    for (const p in currentFunctionContext) {
      if (!currentFunctionContext.hasOwnProperty(p) || newContext.hasOwnProperty(p)) continue;
      newContext[p] = currentFunctionContext[p];
    }
    this.runningContexts.pop();
  }

  useFunctionContext(run) {
    const functionContext = last(this.functionContexts);
    this.runningContexts.push(functionContext);
    run();
    this.runningContexts.pop();
  }

  /**
   * Recursively scans AST for declarations and functions, and add them to their respective context
   * @param ast
   */
  scan(ast) {
    if (!ast) return;
    if (Array.isArray(ast)) {
      for (let i = 0; i < ast.length; i++) {
        this.scan(ast[i]);
      }
      return;
    }
    switch (ast.type) {
      case 'Program':
        this.scan(ast.body);
        break;
      case 'BlockStatement':
        this.newContext(() => {
          this.scan(ast.body);
        });
        break;
      case 'AssignmentExpression':
      case 'LogicalExpression':
        this.scan(ast.left);
        this.scan(ast.right);
        break;
      case 'BinaryExpression':
        this.scan(ast.left);
        this.scan(ast.right);
        break;
      case 'UpdateExpression':
      case 'UnaryExpression':
        this.scan(ast.argument);
        break;
      case 'VariableDeclaration':
        if (ast.kind === 'var') {
          this.useFunctionContext(() => {
            ast.declarations = utils.normalizeDeclarations(ast);
            this.scan(ast.declarations);
          });
        } else {
          ast.declarations = utils.normalizeDeclarations(ast);
          this.scan(ast.declarations);
        }
        break;
      case 'VariableDeclarator':
        const { currentContext } = this;
        const declaration = {
          ast: ast,
          context: currentContext,
          name: ast.id.name,
          origin: 'declaration',
          forceInteger: this.inLoopInit,
          assignable: currentContext === this.currentFunctionContext || (!this.inLoopInit && !currentContext.hasOwnProperty(ast.id.name)),
        };
        currentContext[ast.id.name] = declaration;
        this.declarations.push(declaration);
        this.scan(ast.id);
        this.scan(ast.init);
        break;
      case 'FunctionExpression':
      case 'FunctionDeclaration':
        if (this.runningContexts.length === 0) {
          this.scan(ast.body);
        } else {
          this.functions.push(ast);
        }
        break;
      case 'IfStatement':
        this.scan(ast.test);
        this.scan(ast.consequent);
        if (ast.alternate) this.scan(ast.alternate);
        break;
      case 'ForStatement':
        this.newContext(() => {
          this.inLoopInit = true;
          this.scan(ast.init);
          this.inLoopInit = false;
          this.scan(ast.test);
          this.scan(ast.update);
          this.newContext(() => {
            this.scan(ast.body);
          });
        });
        break;
      case 'DoWhileStatement':
      case 'WhileStatement':
        this.newContext(() => {
          this.scan(ast.body);
          this.scan(ast.test);
        });
        break;
      case 'Identifier':
        this.identifiers.push({
          context: this.currentContext,
          ast,
        });
        break;
      case 'ReturnStatement':
        this.returnStatements.push(ast);
        this.scan(ast.argument);
        break;
      case 'MemberExpression':
        this.scan(ast.object);
        this.scan(ast.property);
        break;
      case 'ExpressionStatement':
        this.scan(ast.expression);
        break;
      case 'SequenceExpression':
        this.scan(ast.expressions);
        break;
      case 'CallExpression':
        this.functionCalls.push({
          context: this.currentContext,
          ast,
        });
        this.scan(ast.arguments);
        break;
      case 'ArrayExpression':
        this.scan(ast.elements);
        break;
      case 'ConditionalExpression':
        this.scan(ast.test);
        this.scan(ast.alternate);
        this.scan(ast.consequent);
        break;
      case 'SwitchStatement':
        this.scan(ast.discriminant);
        this.scan(ast.cases);
        break;
      case 'SwitchCase':
        this.scan(ast.test);
        this.scan(ast.consequent);
        break;

      case 'ThisExpression':
      case 'Literal':
      case 'DebuggerStatement':
      case 'EmptyStatement':
      case 'BreakStatement':
      case 'ContinueStatement':
        break;
      default:
        throw new Error(`unhandled type "${ast.type}"`);
    }
  }
}

module.exports = {
  FunctionTracer,
};