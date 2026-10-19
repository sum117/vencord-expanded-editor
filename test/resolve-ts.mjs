// Vencord's tsconfig rejects ".ts" import suffixes, so the plugin imports "./split";
// Node needs the extension. Retry unresolved relative specifiers with ".ts".
import { registerHooks } from "node:module";

registerHooks({
    resolve(specifier, context, next) {
        try {
            return next(specifier, context);
        } catch (e) {
            if (!specifier.startsWith(".") || specifier.endsWith(".ts")) throw e;
            return next(specifier + ".ts", context);
        }
    },
});
