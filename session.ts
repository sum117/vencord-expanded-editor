/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FORMAT_BY_KEY, type FormatId } from "./format";
import { type GoalChoice, type GoalProgress, goalProgress, type WordGoals } from "./goals";
import { type MessagePlan, planMessages, remainderAfter } from "./split";
import { type Stats, stats } from "./text";

export type View = "write" | "preview";

export type SendState =
    | { readonly phase: "idle"; }
    | {
        readonly phase: "sending";
        readonly plan: MessagePlan;
        readonly sent: number;
        readonly resumeAt: number | null;
    }
    | { readonly phase: "failed"; readonly sent: number; readonly total: number; readonly reason: string; };

export interface EditorState {
    readonly channelId: string;
    readonly text: string;
    readonly view: View;
    readonly calm: boolean;
    readonly send: SendState;
    readonly acknowledgedGoal: number | null;
    readonly goalFlash: number;
    readonly restored: Restored | null;
}

export type EditorAction =
    | { readonly type: "input"; readonly text: string; }
    | { readonly type: "view"; readonly view: View; }
    | { readonly type: "calm"; readonly on: boolean; }
    | { readonly type: "goal/reached"; readonly target: number; readonly celebrate: boolean; }
    | { readonly type: "send/start"; readonly plan: MessagePlan; }
    | { readonly type: "send/wait"; readonly until: number; }
    | { readonly type: "send/chunk"; }
    | { readonly type: "send/fail"; readonly reason: string; }
    | { readonly type: "send/done"; }
    | { readonly type: "send/dismiss"; }
    | { readonly type: "restored/dismiss"; };

/** Discord's DraftStore cuts a saved draft at this length (read back live). */
export const DRAFT_CAP = 4500;

export interface JournalEntry {
    readonly text: string;
    readonly savedAt: number;
}

export interface Restored {
    readonly savedAt: number;
    readonly chatBox: string | null;
}

export interface Opening {
    readonly text: string;
    readonly restored: Restored | null;
    readonly journalRedundant: boolean;
}

export function decideOpening(chatBox: string, journal: JournalEntry | undefined): Opening {
    if (!journal || journal.text === chatBox) return { text: chatBox, restored: null, journalRedundant: !!journal };
    const cutOff = chatBox !== "" && journal.text.startsWith(chatBox);
    if (cutOff && chatBox.length === DRAFT_CAP) return { text: journal.text, restored: null, journalRedundant: false };
    return {
        text: journal.text,
        restored: { savedAt: journal.savedAt, chatBox: chatBox === "" || cutOff ? null : chatBox },
        journalRedundant: false,
    };
}

export function initialState(channelId: string, text: string, restored: Restored | null = null): EditorState {
    return { channelId, text, view: "write", calm: false, send: { phase: "idle" }, acknowledgedGoal: null, goalFlash: 0, restored };
}

export function reduce(state: EditorState, action: EditorAction): EditorState {
    const { send } = state;
    switch (action.type) {
        case "input":
            if (send.phase === "sending" || action.text === state.text) return state;
            return { ...state, text: action.text, send: send.phase === "failed" ? { phase: "idle" } : send };
        case "view":
            return action.view === state.view ? state : { ...state, view: action.view };
        case "calm":
            return action.on === state.calm ? state : { ...state, calm: action.on };
        case "goal/reached":
            return {
                ...state,
                acknowledgedGoal: action.target,
                goalFlash: action.celebrate ? state.goalFlash + 1 : state.goalFlash,
            };
        case "send/start":
            if (send.phase === "sending" || !action.plan.chunks.length) return state;
            return { ...state, send: { phase: "sending", plan: action.plan, sent: 0, resumeAt: null } };
        case "send/wait":
            return send.phase === "sending" ? { ...state, send: { ...send, resumeAt: action.until } } : state;
        case "send/chunk":
            if (send.phase !== "sending" || send.sent >= send.plan.chunks.length) return state;
            return { ...state, send: { ...send, sent: send.sent + 1, resumeAt: null } };
        case "send/fail":
            if (send.phase !== "sending") return state;
            return {
                ...state,
                text: remainderAfter(send.plan, send.sent),
                send: { phase: "failed", sent: send.sent, total: send.plan.chunks.length, reason: action.reason },
            };
        case "send/done":
            return send.phase === "sending" ? { ...state, text: "", send: { phase: "idle" } } : state;
        case "send/dismiss":
            return send.phase === "failed" ? { ...state, send: { phase: "idle" } } : state;
        case "restored/dismiss":
            return state.restored ? { ...state, restored: null } : state;
    }
}

export function keptText(state: EditorState): string {
    return state.send.phase === "sending" ? remainderAfter(state.send.plan, state.send.sent) : state.text;
}

export const isEditable = (state: EditorState) => state.send.phase !== "sending";

export function escapeIntent(state: EditorState): "leaveCalm" | "close" {
    return state.calm ? "leaveCalm" : "close";
}

export interface Budget {
    readonly chars: number;
    readonly limit: number;
    readonly messages: number;
    readonly tone: "quiet" | "near" | "split";
}

export interface Derived {
    readonly stats: Stats;
    readonly plan: MessagePlan;
    readonly budget: Budget;
    readonly progress: GoalProgress | null;
}

export function derive(text: string, limit: number, goals: WordGoals, goal: GoalChoice): Derived {
    const s = stats(text);
    const plan = planMessages(text, limit);
    const messages = plan.chunks.length;
    const tone = messages > 1 ? "split" : s.chars >= limit * 0.9 ? "near" : "quiet";
    return {
        stats: s,
        plan,
        budget: { chars: s.chars, limit, messages, tone },
        progress: goalProgress(s.words, goals, goal),
    };
}

export type Command = "send" | "togglePreview" | "toggleCalm";

export interface KeyBinding {
    readonly command: Command;
    readonly shift: boolean;
    readonly key: string;
    readonly hint: string;
}

export const KEYMAP: readonly KeyBinding[] = [
    { command: "send", shift: false, key: "Enter", hint: "send" },
    { command: "togglePreview", shift: true, key: "p", hint: "preview" },
    { command: "toggleCalm", shift: true, key: "f", hint: "calm" },
];

export interface KeyLike {
    readonly key: string;
    readonly ctrlKey: boolean;
    readonly metaKey: boolean;
    readonly shiftKey: boolean;
    readonly altKey: boolean;
}

export type KeyAction = { readonly kind: "command"; readonly command: Command; } | { readonly kind: "format"; readonly id: FormatId; };

export function keyAction(e: KeyLike, isMac: boolean): KeyAction | null {
    const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (!mod || e.altKey) return null;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const binding = KEYMAP.find(b => b.key === key && b.shift === e.shiftKey);
    if (binding) return { kind: "command", command: binding.command };
    const id = e.shiftKey ? undefined : FORMAT_BY_KEY.get(key);
    return id ? { kind: "format", id } : null;
}

export function keyHint(binding: KeyBinding, isMac: boolean): string {
    const mod = isMac ? "⌘" : "Ctrl+";
    const shift = binding.shift ? (isMac ? "⇧" : "Shift+") : "";
    const key = binding.key.length === 1 ? binding.key.toUpperCase() : binding.key;
    return `${mod}${shift}${key}`;
}
