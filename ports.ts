/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Every Discord store, flux action and finder the plugin touches. Lazy exports
// are read inside function bodies: they are undefined until Discord loads.

import * as DataStore from "@api/DataStore";
import { sendMessage } from "@utils/discord";
import type { Message } from "@vencord/discord-types";
import { findByPropsLazy, findCssClassesLazy, findStoreLazy } from "@webpack";
import {
    ChannelStore, DraftStore, FluxDispatcher, GuildMemberStore, MessageActions, MessageStore, Parser,
    PendingReplyStore, PermissionsBits, PermissionStore, SelectedChannelStore, UserStore, useStateFromStores
} from "@webpack/common";
import type { ReactNode } from "react";

import { decideOpening, type JournalEntry, type Opening } from "./session";

const CHANNEL_MESSAGE_DRAFT = 0;

const DraftActions: {
    saveDraft(channelId: string, draft: string, draftType: number): void;
    clearDraft(channelId: string, draftType: number): void;
} = findByPropsLazy("clearDraft", "saveDraft", "changeDraft");

const MessageLength: { canUseIncreasedMessageLength(user: unknown): boolean; } = findByPropsLazy("canUseIncreasedMessageLength");

const SlowmodeStore: { getSlowmodeCooldownGuess(channelId: string, type?: number): number; } = findStoreLazy("SlowmodeStore");

const markupClasses = findCssClassesLazy("markup", "codeContainer");
const messageClasses = findCssClassesLazy("messageContent", "markupRtl");

const journalKey = (channelId: string) => `ExpandedEditor:journal:${channelId}`;
/** After a close, Discord persists the draft within 8-20 s (measured); the journal outlives that window. */
const JOURNAL_GRACE_MS = 30_000;
const pendingDeletes = new Map<string, ReturnType<typeof setTimeout>>();
let journalWrites = Promise.resolve();

/** One chain for every journal write, so a late set can never land after a delete. */
function queueJournal(write: () => Promise<void>) {
    journalWrites = journalWrites.then(write, write).catch(() => { });
}

function parseJournal(raw: unknown): JournalEntry | undefined {
    const e = raw as Partial<JournalEntry> | undefined;
    return typeof e?.text === "string" && typeof e.savedAt === "number" ? { text: e.text, savedAt: e.savedAt } : undefined;
}

/**
 * Discord's chat-input draft. `saveDraft` updates the store and the mounted
 * chat box at once; never `changeDraft`, which leaves the visible input stale.
 * Discord writes drafts to disk only 8-20 s later and cuts them at 4,500
 * characters, so every write also goes to a journal in Vencord's DataStore.
 */
export const draft = {
    read(channelId: string): string {
        return DraftStore.getDraft(channelId, CHANNEL_MESSAGE_DRAFT) ?? "";
    },
    async open(channelId: string): Promise<Opening> {
        clearTimeout(pendingDeletes.get(channelId));
        pendingDeletes.delete(channelId);
        const chatBox = draft.read(channelId);
        const journal = parseJournal(await DataStore.get(journalKey(channelId)).catch(() => undefined));
        const opening = decideOpening(chatBox, journal);
        if (opening.journalRedundant) queueJournal(() => DataStore.del(journalKey(channelId)));
        return opening;
    },
    write(channelId: string, text: string) {
        if (text === "") DraftActions.clearDraft(channelId, CHANNEL_MESSAGE_DRAFT);
        else DraftActions.saveDraft(channelId, text, CHANNEL_MESSAGE_DRAFT);
        const entry: JournalEntry = { text, savedAt: Date.now() };
        queueJournal(() => DataStore.set(journalKey(channelId), entry));
    },
    /**
     * The session is over. The journal goes once Discord has surely persisted
     * the draft, unless the chat box holds the text cut short.
     */
    release(channelId: string, text: string) {
        if (draft.read(channelId) !== text) return;
        clearTimeout(pendingDeletes.get(channelId));
        pendingDeletes.set(channelId, setTimeout(() => {
            pendingDeletes.delete(channelId);
            queueJournal(() => DataStore.del(journalKey(channelId)));
        }, JOURNAL_GRACE_MS));
    },
};

export function messageLimit(): number {
    try {
        return MessageLength.canUseIncreasedMessageLength(UserStore.getCurrentUser()) ? 4000 : 2000;
    } catch {
        return 2000;
    }
}

export function canSendIn(channelId: string): boolean {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return false;
    const permission = channel.isThread() ? PermissionsBits.SEND_MESSAGES_IN_THREADS : PermissionsBits.SEND_MESSAGES;
    return channel.isPrivate() || PermissionStore.can(permission, channel);
}

/** "#general", "@someone", or the thread's name. */
export function channelLabel(channelId: string): string {
    const channel = ChannelStore.getChannel(channelId);
    if (!channel) return "";
    if (channel.isDM()) {
        const user = UserStore.getUser(channel.recipients[0]);
        return "@" + (user?.globalName ?? user?.username ?? "unknown");
    }
    if (channel.isGroupDM()) return channel.name || "Group DM";
    return (channel.isThread() ? "" : "#") + channel.name;
}

/**
 * How long to wait before the next message may go, in ms. Discord resets its
 * own cooldown guess after each send; the channel's rate limit is the floor
 * after a send. Members who manage messages, channels or threads are exempt.
 */
export function slowmodeWaitMs(channelId: string, afterSend: boolean): number {
    const channel = ChannelStore.getChannel(channelId);
    const perUser = channel?.rateLimitPerUser ?? 0;
    if (!channel || perUser <= 0) return 0;
    const exempt = [PermissionsBits.MANAGE_MESSAGES, PermissionsBits.MANAGE_CHANNELS, PermissionsBits.MANAGE_THREADS]
        .some(p => PermissionStore.can(p, channel));
    if (exempt) return 0;
    const guess = SlowmodeStore.getSlowmodeCooldownGuess(channelId) ?? 0;
    return afterSend ? Math.max(guess, perUser * 1000) : guess;
}

export interface ReplyTarget {
    readonly authorName: string;
}

export function usePendingReply(channelId: string): ReplyTarget | null {
    return useStateFromStores([PendingReplyStore], () => {
        const reply = PendingReplyStore.getPendingReply(channelId);
        return reply ? { authorName: displayName(reply.message.author, reply.channel.guild_id) } : null;
    }, [channelId], (a, b) => a?.authorName === b?.authorName);
}

export function cancelReply(channelId: string) {
    FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
}

/**
 * Sends one message. The first chunk carries the channel's pending reply,
 * which is cleared once it went out. Rejects with Discord's response on failure.
 */
export async function sendChunk(channelId: string, content: string, first: boolean): Promise<void> {
    const reply = first ? PendingReplyStore.getPendingReply(channelId) : undefined;
    const options = reply ? MessageActions.getSendMessageOptionsForReply(reply) : {};
    await sendMessage(channelId, { content }, true, options);
    if (reply) cancelReply(channelId);
}

/** A readable reason from whatever Discord's send rejected with. */
export function failureReason(error: unknown): string {
    const e = error as { body?: { message?: string; }; err?: { message?: string; }; message?: string; status?: number; } | null;
    return e?.body?.message ?? e?.err?.message ?? e?.message ?? (e?.status ? `HTTP ${e.status}` : "Discord refused the message");
}

export function renderMarkdown(text: string, channelId: string): ReactNode {
    return Parser.parse(text, true, {
        channelId,
        allowLinks: true,
        allowHeading: true,
        allowList: true,
        allowEmojiLinks: true,
        previewLinkTarget: false,
        viewingChannelId: SelectedChannelStore.getChannelId(),
    });
}

/** Classes that make rendered markdown look like a message body; empty if Discord renames them. */
export function messageMarkupClass(): string {
    return [markupClasses.markup, messageClasses.messageContent].filter(Boolean).join(" ");
}

function displayName(author: { id: string; username: string; globalName?: string | null; }, guildId?: string | null): string {
    const nick = guildId ? GuildMemberStore.getNick(guildId, author.id) : null;
    return nick ?? author.globalName ?? author.username;
}

export interface RecentMessage {
    readonly id: string;
    readonly authorName: string;
    readonly timestamp: Date;
    readonly content: string;
}

/** The last `n` messages Discord has loaded for the channel, newest last. */
export function useRecentMessages(channelId: string, n: number): readonly RecentMessage[] {
    return useStateFromStores([MessageStore], () => {
        const guildId = ChannelStore.getChannel(channelId)?.guild_id;
        const all: Message[] = [];
        MessageStore.getMessages(channelId)?.forEach(m => { all.push(m); });
        return all.filter(m => m.content?.trim()).slice(-n).map(m => ({
            id: m.id,
            authorName: displayName(m.author, guildId),
            timestamp: new Date(+m.timestamp),
            content: m.content,
        }));
    }, [channelId, n], (a, b) => a.length === b.length && a.every((m, i) => m.id === b[i].id && m.content === b[i].content));
}
