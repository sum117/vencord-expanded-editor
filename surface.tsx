/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// One open editor at a time: its session (state outside React, so a close
// mid-send can wait for the chunk in flight and keep the exact remainder) and
// the full-viewport surface hosted by Discord's modal layer. The layer gives
// a custom root no backdrop and no focus, and with onCloseRequest set, Esc
// asks instead of closing.

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import type { RenderModalProps } from "@vencord/discord-types";
import { closeModal, openModal, React, useEffect, useRef } from "@webpack/common";
import type { KeyboardEvent, ReactNode, RefObject } from "react";

import { cl } from "./chrome";
import { Editor } from "./Editor";
import { draft, failureReason, messageLimit, sendChunk, slowmodeWaitMs } from "./ports";
import { type EditorAction, type EditorState, escapeIntent, initialState, keptText, reduce } from "./session";
import { planMessages } from "./split";

/** Debounce for draft writes while typing; also the most a hard crash can lose. */
const DRAFT_DEBOUNCE_MS = 300;
/** Slack added to slowmode waits so the server's clock agrees the cooldown is over. */
const SLOWMODE_MARGIN_MS = 300;

export interface Snapshot {
    readonly state: EditorState;
    /** True when Discord's draft holds exactly what the session would keep. */
    readonly saved: boolean;
}

export interface Session {
    getSnapshot(): Snapshot;
    subscribe(listener: () => void): () => void;
    dispatch(action: EditorAction): void;
    /** Starts the send loop. Idempotent while sending. */
    send(): void;
    /** Esc: leave calm, or close. */
    escape(): void;
    /** Stops any send before its next chunk, closes the surface and writes what is kept. Idempotent. */
    close(): Promise<void>;
}

let active: Session | null = null;

let opening = false;

export async function openExpandedEditor(channelId: string): Promise<void> {
    if (active || opening) return;
    opening = true;
    try {
        active = createSession(channelId, await draft.open(channelId));
    } finally {
        opening = false;
    }
}

/** Plugin stop: closes through the normal path, so the draft is written. */
export function closeExpandedEditor(): Promise<void> {
    return active?.close() ?? Promise.resolve();
}

function createSession(channelId: string, text: string): Session {
    let snapshot: Snapshot = { state: initialState(channelId, text), saved: true };
    let savedText = snapshot.state.text;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed: Promise<void> | null = null;
    let inFlight: Promise<void> = Promise.resolve();
    const stop = new AbortController();
    const listeners = new Set<() => void>();

    const publish = (state: EditorState) => {
        snapshot = { state, saved: keptText(state) === savedText };
        listeners.forEach(l => l());
    };

    /** `force` rewrites even an unchanged text: on close, in case anything else touched the draft. */
    const flush = (force = false) => {
        clearTimeout(timer);
        const text = keptText(snapshot.state);
        if (force || text !== savedText) {
            draft.write(channelId, text);
            savedText = text;
        }
        publish(snapshot.state);
    };

    const dispatch = (action: EditorAction) => {
        const next = reduce(snapshot.state, action);
        if (next === snapshot.state) return;
        publish(next);
        clearTimeout(timer);
        if (!snapshot.saved && !closed) timer = setTimeout(flush, DRAFT_DEBOUNCE_MS);
    };

    const session: Session = {
        getSnapshot: () => snapshot,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        dispatch,
        send() {
            const { state } = snapshot;
            if (state.send.phase === "sending" || closed) return;
            const plan = planMessages(state.text, messageLimit());
            if (!plan.chunks.length) return;
            flush();
            dispatch({ type: "send/start", plan });
            inFlight = (async () => {
                for (let i = 0; i < plan.chunks.length; i++) {
                    const wait = slowmodeWaitMs(channelId, i > 0);
                    if (wait > 0) {
                        dispatch({ type: "send/wait", until: Date.now() + wait + SLOWMODE_MARGIN_MS });
                        await sleep(wait + SLOWMODE_MARGIN_MS, stop.signal);
                    }
                    if (stop.signal.aborted) return;
                    try {
                        await sendChunk(channelId, plan.chunks[i].content, i === 0);
                    } catch (e) {
                        dispatch({ type: "send/fail", reason: failureReason(e) });
                        flush();
                        return;
                    }
                    dispatch({ type: "send/chunk" });
                    flush();
                }
                dispatch({ type: "send/done" });
                flush();
                void session.close();
            })();
        },
        escape() {
            if (escapeIntent(snapshot.state) === "leaveCalm") dispatch({ type: "calm", on: false });
            else void session.close();
        },
        close() {
            closed ??= (async () => {
                stop.abort();
                flush();
                closeModal(modalKey);
                await inFlight;
                flush(true);
                if (active === session) active = null;
            })();
            return closed;
        },
    };

    const modalKey = openModal(
        props => <Root {...props} session={session} />,
        { onCloseRequest: () => session.escape(), onCloseCallback: () => void session.close() },
    );
    return session;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise(resolve => {
        const t = setTimeout(resolve, ms);
        signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
    });
}

const FOCUSABLE = "button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select, a[href], [tabindex]:not([tabindex='-1'])";

/** Keeps Tab inside the surface; Discord's layer gives a custom root no focus lock. */
function trapTab(e: KeyboardEvent<HTMLDivElement>) {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.getClientRects().length > 0);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const current = document.activeElement;
    if (e.shiftKey ? current === first || !e.currentTarget.contains(current) : current === last) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
    }
}

/**
 * Discord moves focus into the chat box behind us on some draft writes (a
 * DRAFT_CLEAR focuses it), and keys typed there would go to the channel.
 * While the surface is up, a text field outside it never keeps focus.
 */
function useFocusGuard(root: RefObject<HTMLDivElement | null>, active: boolean) {
    useEffect(() => {
        if (!active) return;
        let last: HTMLElement | null = null;
        const onFocusIn = (e: FocusEvent) => {
            const el = root.current;
            const target = e.target as HTMLElement;
            if (!el) return;
            if (el.contains(target)) {
                last = target;
                return;
            }
            if (!target.isContentEditable && !target.matches("textarea, input")) return;
            const back = last && el.contains(last) && last.getClientRects().length
                ? last
                : el.querySelector<HTMLElement>("textarea:not([hidden])") ?? el;
            back.focus({ preventScroll: true });
        };
        document.addEventListener("focusin", onFocusIn, true);
        return () => document.removeEventListener("focusin", onFocusIn, true);
    }, [active]);
}

function Root({ session, transitionState }: RenderModalProps & { session: Session; }): ReactNode {
    const snapshot = React.useSyncExternalStore(session.subscribe, session.getSnapshot);
    const root = useRef<HTMLDivElement>(null);
    useFocusGuard(root, transitionState < 2);
    return (
        <div
            ref={root}
            tabIndex={-1}
            className={cl("root")}
            role="dialog"
            aria-modal="true"
            aria-label="Expanded editor"
            data-state={transitionState}
            onKeyDown={e => {
                if (e.key === "Tab") trapTab(e);
                if (e.key !== "Escape") e.stopPropagation();
            }}
            onMouseDown={e => {
                // A press on a bar's bare space keeps the caret where it was instead of dropping focus to the page.
                const target = e.target as HTMLElement;
                if (target.closest(`.${cl("bar")}`) && !target.closest(FOCUSABLE)) e.preventDefault();
            }}
        >
            <ErrorBoundary fallback={() => <SurfaceCrash session={session} />}>
                <Editor session={session} snapshot={snapshot} />
            </ErrorBoundary>
        </div>
    );
}

function SurfaceCrash({ session }: { session: Session; }): ReactNode {
    return (
        <div className={cl("crash")}>
            <p>The editor hit an error. Your text is saved in the chat box.</p>
            <Button variant="secondary" onClick={() => void session.close()}>Close</Button>
        </div>
    );
}
