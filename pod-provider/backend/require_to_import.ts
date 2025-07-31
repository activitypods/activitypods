import type { FileInfo, API, Options } from 'jscodeshift';

export default function transform(file: FileInfo, api: API, options: Options): string | undefined {
  const j = api.jscodeshift;
  const root = j(file.source);

  // Find all require calls
  root
    .find(j.CallExpression, {
      callee: { type: 'Identifier', name: 'require' }
    })
    .forEach((path: any) => {
      // Ensure the parent node is a VariableDeclarator
      if (path.parent.node.type === 'VariableDeclarator') {
        // Get the module name
        const moduleName = path.node.arguments[0].value;

        if (path.parent.node.id.type === 'Identifier') {
          // Simple assignment: const foo = require('bar')
          const varName = path.parent.node.id.name;
          j(path.parent.parent).replaceWith(
            j.importDeclaration([j.importDefaultSpecifier(j.identifier(varName))], j.literal(moduleName))
          );
        } else if (path.parent.node.id.type === 'ObjectPattern') {
          // Destructuring: const { foo, bar } = require('baz')
          const importSpecifiers = path.parent.node.id.properties
            .map((prop: any) => {
              if (prop.type === 'Property' && prop.key.type === 'Identifier') {
                if (prop.computed === false && prop.key.name === prop.value.name) {
                  // { foo } shorthand
                  return j.importSpecifier(j.identifier(prop.key.name));
                } else if (prop.value.type === 'Identifier') {
                  // { foo: bar }
                  return j.importSpecifier(j.identifier(prop.key.name), j.identifier(prop.value.name));
                }
              }
              return null;
            })
            .filter(Boolean);

          j(path.parent.parent).replaceWith(j.importDeclaration(importSpecifiers, j.literal(moduleName)));
        }
      }
    });

  return root.toSource();
}
