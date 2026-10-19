/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Presentational pieces for the bars. Vencord components and Discord tokens
// only; every prop is a value or a callback.

import { BaseText } from "@components/BaseText";
import { Button, TextButton } from "@components/Button";
import { ReplyIcon } from "@components/Icons";
import { IS_MAC } from "@utils/constants";
import { classNameFactory } from "@utils/css";
import { Tooltip, useEffect, useRef, useState } from "@webpack/common";
import type { ReactNode } from "react";

import { type FormatId, FORMATS, type FormatSpec } from "./format";
import type { GoalChoice, GoalProgress, GoalSlot, WordGoals } from "./goals";
import type { ReplyTarget } from "./ports";
import type { Derived, SendState } from "./session";
import { type FaceId, FACES, FONT_SIZES } from "./settings";
import { sendLabel } from "./split";
import { formatCount, formatReadingTime } from "./text";

export const cl = classNameFactory("vc-ee-");

export interface SegmentedOption<T> {
    readonly value: T;
    readonly label: ReactNode;
    readonly title?: string;
}

/** One control for every either/or: Write|Preview, the typeface, the goal. */
export function Segmented<T extends string | number | null>(props: {
    label: string;
    value: T;
    options: readonly SegmentedOption<T>[];
    onChange(value: T): void;
    size?: "sm" | "xs";
}): ReactNode {
    return (
        <div className={cl("segmented")} data-size={props.size ?? "sm"} role="radiogroup" aria-label={props.label}>
            {props.options.map(o => (
                <button
                    key={String(o.value)}
                    type="button"
                    role="radio"
                    aria-checked={o.value === props.value}
                    title={o.title}
                    className={cl("segment")}
                    onClick={() => props.onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

/** Icon button with a Discord tooltip; `pressed` makes it a toggle. */
export function IconButton(props: {
    label: string;
    hint?: string;
    pressed?: boolean;
    disabled?: boolean;
    keepFocus?: boolean;
    onClick(): void;
    children: ReactNode;
}): ReactNode {
    const text = props.hint ? `${props.label} (${props.hint})` : props.label;
    return (
        <Tooltip text={text}>
            {tip => (
                <Button
                    {...tip}
                    variant="none"
                    size="iconOnly"
                    className={cl("icon-button")}
                    aria-label={props.label}
                    aria-pressed={props.pressed}
                    disabled={props.disabled}
                    onMouseDown={props.keepFocus ? e => e.preventDefault() : undefined}
                    onClick={() => { tip.onClick(); props.onClick(); }}
                >
                    {props.children}
                </Button>
            )}
        </Tooltip>
    );
}

const modKey = IS_MAC ? "⌘" : "Ctrl+";

function FormatGlyph({ spec }: { spec: FormatSpec; }): ReactNode {
    return <span className={cl("glyph")} data-format={spec.id} aria-hidden="true">{spec.glyph}</span>;
}

/** FORMATS in groups split by hairlines. Mouse down keeps the textarea's selection. */
export function Toolbar({ onFormat, disabled }: { onFormat(id: FormatId): void; disabled: boolean; }): ReactNode {
    const groups = [0, 1, 2].map(g => FORMATS.filter(f => f.group === g));
    return (
        <div className={cl("toolbar")} role="toolbar" aria-label="Formatting">
            {groups.map((group, i) => (
                <div key={i} className={cl("toolbar-group")}>
                    {group.map(spec => (
                        <IconButton
                            key={spec.id}
                            label={spec.label}
                            hint={spec.key && modKey + spec.key.toUpperCase()}
                            disabled={disabled}
                            keepFocus
                            onClick={() => onFormat(spec.id)}
                        >
                            <FormatGlyph spec={spec} />
                        </IconButton>
                    ))}
                </div>
            ))}
        </div>
    );
}

/** "Aa" button with a small panel: typeface and size. Esc and outside clicks close the panel only. */
export function TypePicker(props: { face: FaceId; size: number; onFace(face: FaceId): void; onSize(size: number): void; }): ReactNode {
    const [open, setOpen] = useState(false);
    const box = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("pointerdown", onDown, true);
        return () => document.removeEventListener("pointerdown", onDown, true);
    }, [open]);

    const index = FONT_SIZES.indexOf(props.size as typeof FONT_SIZES[number]);
    const step = (d: -1 | 1) => {
        const next = FONT_SIZES[Math.min(FONT_SIZES.length - 1, Math.max(0, (index < 0 ? 2 : index) + d))];
        props.onSize(next);
    };

    return (
        <div
            ref={box}
            className={cl("type-picker")}
            onKeyDown={e => {
                if (e.key === "Escape" && open) {
                    e.stopPropagation();
                    setOpen(false);
                }
            }}
        >
            <IconButton label="Typeface and size" pressed={open} onClick={() => setOpen(o => !o)}>
                <span className={cl("glyph")} aria-hidden="true">Aa</span>
            </IconButton>
            {open && (
                <div className={cl("type-panel")} role="dialog" aria-label="Typeface and size">
                    <BaseText size="xs" weight="semibold" className={cl("panel-label")}>Typeface</BaseText>
                    <Segmented
                        label="Typeface"
                        value={props.face}
                        onChange={props.onFace}
                        options={(Object.keys(FACES) as FaceId[]).map(id => ({
                            value: id,
                            label: <span className={cl("face-option")} style={{ fontFamily: FACES[id].stack }}>{FACES[id].label}</span>,
                        }))}
                    />
                    <BaseText size="xs" weight="semibold" className={cl("panel-label")}>Size</BaseText>
                    <div className={cl("size-row")}>
                        <Button variant="secondary" size="small" aria-label="Smaller" disabled={index === 0} onClick={() => step(-1)}>A−</Button>
                        <BaseText size="sm" className={cl("size-value")}>{props.size}px</BaseText>
                        <Button variant="secondary" size="small" aria-label="Larger" disabled={index === FONT_SIZES.length - 1} onClick={() => step(1)}>A+</Button>
                    </div>
                </div>
            )}
        </div>
    );
}

export function CalmIcon(): ReactNode {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
        </svg>
    );
}

export function RecentIcon(): ReactNode {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M15 4v16" />
        </svg>
    );
}

/** 2px goal meter on a bar's lower edge; one glow when the goal is reached. */
export function Meter({ progress }: { progress: GoalProgress; }): ReactNode {
    return (
        <div
            className={cl("meter")}
            role="progressbar"
            aria-label="Word goal"
            aria-valuemin={0}
            aria-valuemax={progress.target}
            aria-valuenow={Math.min(progress.words, progress.target)}
            data-reached={progress.reached || undefined}
        >
            <div className={cl("meter-fill")} style={{ inlineSize: `${progress.ratio * 100}%` }} />
        </div>
    );
}

export function GoalPicker({ goals, choice, onChange, size = "xs" }: { goals: WordGoals; choice: GoalChoice; onChange(c: GoalChoice): void; size?: "xs" | "sm"; }): ReactNode {
    const names = ["Short", "Medium", "Long"];
    return (
        <Segmented<GoalChoice>
            label="Word goal"
            size={size}
            value={choice}
            onChange={onChange}
            options={[
                { value: null, label: "No goal" },
                ...goals.map((g, i) => ({ value: i as GoalSlot, label: formatCount(g), title: `${names[i]} goal: ${formatCount(g)} words` })),
            ]}
        />
    );
}

/** "1,284 words · 3,412 / 4,000 · 6 min read"; past the limit the count of messages replaces the warning. */
export function Status({ derived }: { derived: Derived; }): ReactNode {
    const { stats, budget } = derived;
    return (
        <BaseText tag="span" size="sm" className={cl("status")} defaultColor={false}>
            <span>{formatCount(stats.words)} {stats.words === 1 ? "word" : "words"}</span>
            <span className={cl("dot")} aria-hidden="true">·</span>
            <span className={cl("chars")} data-tone={budget.tone}>
                {formatCount(budget.chars)} / {formatCount(budget.limit)}
                {budget.tone === "split" && <span className={cl("messages")}> · {budget.messages} messages</span>}
            </span>
            {stats.readingMinutes > 0 && <>
                <span className={cl("dot")} aria-hidden="true">·</span>
                <span>{formatReadingTime(stats.readingMinutes)}</span>
            </>}
        </BaseText>
    );
}

function formatClock(ms: number): string {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Re-renders every quarter second while `until` is in the future. */
function useCountdown(until: number | null): number {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        if (until === null) return;
        const t = setInterval(() => setNow(Date.now()), 250);
        return () => clearInterval(t);
    }, [until]);
    return until === null ? 0 : until - now;
}

export function SendButton({ send, messages, onSend }: { send: SendState; messages: number; onSend(): void; }): ReactNode {
    const left = useCountdown(send.phase === "sending" ? send.resumeAt : null);
    let label = sendLabel(messages);
    if (send.phase === "sending") {
        label = send.resumeAt !== null && left > 0
            ? `Next in ${formatClock(left)}`
            : send.plan.chunks.length > 1 ? `Sending ${send.sent + 1} of ${send.plan.chunks.length}…` : "Sending…";
    }
    return (
        <Button variant="primary" size="small" className={cl("send")} disabled={messages === 0 || send.phase === "sending"} onClick={onSend}>
            {label}
        </Button>
    );
}

export function FailedNotice({ send, onRetry, onDismiss }: { send: Extract<SendState, { phase: "failed"; }>; onRetry(): void; onDismiss(): void; }): ReactNode {
    const sent = send.sent === 0 ? "Nothing was sent." : `Sent ${send.sent} of ${send.total}.`;
    return (
        <div className={cl("notice")} role="alert">
            <BaseText tag="span" size="sm" defaultColor={false} className={cl("notice-text")}>
                {sent} The rest is here. <span className={cl("notice-reason")}>{send.reason}</span>
            </BaseText>
            <TextButton variant="primary" onClick={onRetry}>Try again</TextButton>
            <TextButton variant="secondary" onClick={onDismiss}>Dismiss</TextButton>
        </div>
    );
}

export function ReplyChip({ reply, onCancel }: { reply: ReplyTarget; onCancel(): void; }): ReactNode {
    return (
        <span className={cl("reply")}>
            <ReplyIcon width={14} height={14} />
            <BaseText tag="span" size="sm" defaultColor={false}>Replying to <strong>{reply.authorName}</strong></BaseText>
            <button type="button" className={cl("reply-cancel")} aria-label="Cancel reply" onClick={onCancel}>×</button>
        </span>
    );
}

/** Calm's corner line: the count, the goal once, or how to leave. Keyed spans replay their CSS fade. */
export function Whisper({ words, progress, flash, entered }: { words: number; progress: GoalProgress | null; flash: number; entered: number; }): ReactNode {
    const count = progress ? `${formatCount(words)} / ${formatCount(progress.target)} words` : `${formatCount(words)} ${words === 1 ? "word" : "words"}`;
    return (
        <div className={cl("whisper")} aria-live="polite">
            <BaseText tag="span" size="xs" defaultColor={false} className={cl("whisper-count")} data-wait={flash > 0 ? "goal" : "hint"} key={`c${flash}-${entered}`}>{count}</BaseText>
            {flash > 0 && <BaseText tag="span" size="xs" defaultColor={false} className={cl("whisper-goal")} key={`g${flash}`}>Goal reached · {formatCount(words)} words</BaseText>}
            <BaseText tag="span" size="xs" defaultColor={false} className={cl("whisper-hint")} key={`h${entered}`}>Esc leaves calm</BaseText>
        </div>
    );
}
