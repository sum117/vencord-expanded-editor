/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { PencilIcon } from "@components/Icons";
import { IS_MAC } from "@utils/constants";
import definePlugin from "@utils/types";
import type { Channel } from "@vencord/discord-types";
import { Menu, SelectedChannelStore } from "@webpack/common";

import { canSendIn } from "./ports";
import { settings } from "./settings";
import managedStyle from "./styles.css?managed";
import { closeExpandedEditor, openExpandedEditor } from "./surface";

const attachMenuPatch: NavContextMenuPatchCallback = (children, props: { channel?: Channel; }) => {
    const channelId = props?.channel?.id;
    if (!channelId || !canSendIn(channelId)) return;
    children.push(
        <Menu.MenuItem
            id="vc-expanded-editor"
            label="Expanded editor"
            leadingAccessory={{ type: "icon", icon: PencilIcon }}
            action={() => openExpandedEditor(channelId)}
        />
    );
};

function onGlobalKeyDown(e: KeyboardEvent) {
    const mod = IS_MAC ? e.metaKey : e.ctrlKey;
    if (!mod || !e.shiftKey || e.altKey || e.key.toLowerCase() !== "e") return;
    const channelId = SelectedChannelStore.getChannelId();
    if (!channelId || !canSendIn(channelId)) return;
    e.preventDefault();
    openExpandedEditor(channelId);
}

export default definePlugin({
    name: "ExpandedEditor",
    description: "A full-screen writing surface for long posts: preview, stats, word goals, calm mode, and sending with automatic splitting.",
    authors: [{ name: "sum117", id: 0n }],
    settings,
    managedStyle,
    contextMenus: {
        "channel-attach": attachMenuPatch,
    },
    start() {
        document.addEventListener("keydown", onGlobalKeyDown);
    },
    stop() {
        document.removeEventListener("keydown", onGlobalKeyDown);
        // Closes the surface and writes the draft synchronously, before managedStyle goes.
        void closeExpandedEditor();
    },
});
