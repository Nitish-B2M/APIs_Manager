import { Project, SyntaxKind } from 'ts-morph';
import path from 'path';

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
                // If it's already wrapped because it's somehow recursive? 
                const parent = call.getParent();
                // We actually want to check if the lastArg itself is somehow wrapped.
                // Wait. We are replacing the argument! So we just check if it's already a CallExpression to catchAsync?
                // The argument IS an ArrowFunction or FunctionExpression, so it is NOT a CallExpression. Which means it is NOT wrapped!
                // Wait, if it IS wrapped, the argument is a CallExpression `catchAsync(...)`. It won't be ArrowFunction.
                // So this check is perfectly safe.
                
                const argText = lastArg.getText();
                // Double check it's strictly async before wrapping (actually `catchAsync` just wraps the function, if it isn't async it still returns a promise anyway usually)
                if (argText.includes('async ')) {
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
