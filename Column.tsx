/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The writing column. The DOM owns the caret and the undo history, the session
// owns the text; they meet only at the textarea's input event. Every
// programmatic edit goes through commitEdit, so Ctrl+Z undoes it.

import { BaseText } from "@components/BaseText";
import { classes } from "@utils/misc";
import { React, useLayoutEffect, useRef } from "@webpack/common";
import type { MouseEvent, ReactNode, Ref } from "react";

import { cl } from "./chrome";
import { applyFormat, type Edit, type FormatId, insertBlock, minimalPatch } from "./format";
import { messageMarkupClass, renderMarkdown } from "./ports";
import type { EditorState } from "./session";
import type { Boundary, MessagePlan } from "./split";

export interface ColumnHandle {
    format(id: FormatId): void;
    /** Sets a block (a quote) on its own paragraph at the caret. */
    insertBlock(block: string): void;
    focus(): void;
}

export interface ColumnProps {
    ref: Ref<ColumnHandle>;
    state: EditorState;
    /** The plan the preview shows (deferred while typing). */
    plan: MessagePlan;
    placeholder: string;
    onInput(text: string): void;
}

/** Applies an edit as one native, undoable operation that fires `input` like typing. */
function commitEdit(el: HTMLTextAreaElement, edit: Edit) {
    const patch = minimalPatch(el.value, edit.text);
    el.focus();
    el.setSelectionRange(patch.from, patch.to);
    const ok = patch.insert
        ? document.execCommand("insertText", false, patch.insert)
        : patch.from === patch.to || document.execCommand("delete");
    if (!ok || el.value !== edit.text) {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(el, edit.text);
        el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    el.setSelectionRange(edit.selection.start, edit.selection.end);
}

const selectionOf = (el: HTMLTextAreaElement) => ({ start: el.selectionStart, end: el.selectionEnd });

export function Column({ ref, state, plan, placeholder, onInput }: ColumnProps): ReactNode {
    const area = useRef<HTMLTextAreaElement>(null);
    const scroller = useRef<HTMLDivElement>(null);
    const writing = state.view === "write";
    const editable = state.send.phase !== "sending";

    React.useImperativeHandle(ref, () => ({
        format(id) {
            const el = area.current;
            if (!el || !writing || !editable) return;
            commitEdit(el, applyFormat(el.value, selectionOf(el), id));
        },
        insertBlock(block) {
            const el = area.current;
            if (!el || !editable) return;
            commitEdit(el, insertBlock(el.value, selectionOf(el), block));
        },
        focus: () => area.current?.focus(),
    }), [writing, editable]);

    useLayoutEffect(() => {
        // In preview the textarea is hidden; the scroller takes focus so keys stay inside the surface and arrows scroll.
        if (writing) area.current?.focus({ preventScroll: true });
        else scroller.current?.focus({ preventScroll: true });
    }, [writing]);

    useLayoutEffect(() => {
        const el = area.current;
        if (!el) return;
        el.setSelectionRange(el.value.length, el.value.length);
        el.focus({ preventScroll: true });
    }, []);

    const focusEnd = (e: MouseEvent<HTMLDivElement>) => {
        const el = area.current;
        if (e.target !== e.currentTarget || !el || !writing) return;
        e.preventDefault();
        el.focus({ preventScroll: true });
        el.setSelectionRange(el.value.length, el.value.length);
    };

    return (
        <div ref={scroller} className={cl("scroller")} tabIndex={-1} onMouseDown={focusEnd}>
            <div className={cl("column")} onMouseDown={focusEnd}>
                <textarea
                    ref={area}
                    className={cl("input")}
                    hidden={!writing}
                    value={state.text}
                    readOnly={!editable}
                    spellCheck
                    placeholder={placeholder}
                    aria-label={placeholder}
                    onChange={e => onInput(e.currentTarget.value)}
                />
                {!writing && <Preview plan={plan} channelId={state.channelId} />}
            </div>
        </div>
    );
}

const CUT_NAMES: Partial<Record<Boundary, string>> = {
    line: "split at a line",
    sentence: "split mid-paragraph",
    word: "split mid-sentence",
    grapheme: "split mid-word",
    fence: "split inside code",
};

/** The text as Discord will render it, message by message, in the textarea's exact type and place. */
function Preview({ plan, channelId }: { plan: MessagePlan; channelId: string; }): ReactNode {
    if (!plan.chunks.length) return <p className={cl("preview-empty")}>Nothing to preview yet.</p>;
    const markup = messageMarkupClass();
    const total = plan.chunks.length;
    return (
        <div className={cl("preview")}>
            {plan.chunks.map((chunk, i) => (
                <section key={chunk.span[0]} className={cl("message")} aria-label={total > 1 ? `Message ${i + 1} of ${total}` : undefined}>
                    {total > 1 && (
                        <BaseText tag="span" size="xxs" weight="medium" className={cl("message-label")}>
                            {`${i + 1} of ${total}`}
                            {i > 0 && CUT_NAMES[plan.chunks[i - 1].boundary] && <span className={cl("message-cut")}>{CUT_NAMES[plan.chunks[i - 1].boundary]}</span>}
                        </BaseText>
                    )}
                    <div className={classes(markup, cl("prose"))}>{renderMarkdown(chunk.content, channelId)}</div>
                </section>
            ))}
        </div>
    );
}
