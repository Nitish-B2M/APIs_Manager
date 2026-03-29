const { Project, SyntaxKind } = require('ts-morph');
const path = require('path');

const project = new Project({
    tsConfigFilePath: path.join(__dirname, 'tsconfig.json'),
});

const routeFiles = [
    'admin.ts', 'ai.ts', 'collaboration.ts', 'contact.ts', 'mock.ts', 
    'monitor.ts', 'notes.ts', 'scheduler.ts', 'snapshot.ts', 'todos.ts', 'webhook.ts'
];

for (const fileName of routeFiles) {
    const sourceFile = project.getSourceFile(path.join(__dirname, 'src', 'routes', fileName));
    if (!sourceFile) {
        console.log(`File not found: ${fileName}`);
        continue;
    }
    
    let hasChanges = false;
    let needsImport = false;
    
    const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
    
    for (const call of calls) {
        const expr = call.getExpression();
        if (expr.getKind() === SyntaxKind.PropertyAccessExpression && expr.getText().startsWith('router.')) {
            const args = call.getArguments();
            const lastArg = args[args.length - 1];
            
            if (lastArg && (lastArg.getKind() === SyntaxKind.ArrowFunction || lastArg.getKind() === SyntaxKind.FunctionExpression)) {
                const argText = lastArg.getText();
                if (argText.includes('async ')) {
                    // check if parent is catchAsync
                    const parent = call.getParent();
                    if (parent && parent.getText().startsWith('catchAsync(')) {
                        continue;
                    }
                    lastArg.replaceWithText(`catchAsync(${argText})`);
                    hasChanges = true;
                    needsImport = true;
                }
            }
        }
    }
    
    if (needsImport) {
        const imports = sourceFile.getImportDeclarations();
        const hasCatchAsync = imports.some(imp => imp.getNamedImports().some(n => n.getName() === 'catchAsync'));
        if (!hasCatchAsync) {
            sourceFile.insertImportDeclaration(0, {
                namedImports: [{ name: 'catchAsync' }],
                moduleSpecifier: '../utils/catchAsync'
            });
        }
    }
    
    if (hasChanges) {
        sourceFile.saveSync();
        console.log(`Updated ${fileName}`);
    }
}
