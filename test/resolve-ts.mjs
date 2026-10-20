/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Vencord's tsconfig rejects ".ts" import suffixes, so the plugin imports "./split";
// Node needs the extension.
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
