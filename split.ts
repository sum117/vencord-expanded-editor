/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { isSpace } from "./text";

export type CutLevel = "paragraph" | "line" | "sentence" | "word" | "grapheme";
export type Boundary = CutLevel | "fence" | "end";

export interface Chunk {
    readonly content: string;
    readonly span: readonly [from: number, to: number];
    readonly carry: string;
    readonly boundary: Boundary;
}

export interface MessagePlan {
    readonly source: string;
    readonly limit: number;
    readonly chunks: readonly Chunk[];
}

interface Span { from: number; to: number; }
interface Unit extends Span {
    readonly fence?: string;
}

const FENCE = "```";
const FENCE_CLOSE = "\n```";
const QUOTE_CARRY = ">>> ";
const NEXT_LEVEL: Record<CutLevel, CutLevel | null> = {
    paragraph: "line",
    line: "sentence",
    sentence: "word",
    word: "grapheme",
    grapheme: null,
};

const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function trimSpan(source: string, from: number, to: number): Span | null {
    while (from < to && isSpace(source[from])) from++;
    while (to > from && isSpace(source[to - 1])) to--;
    return from < to ? { from, to } : null;
}

function lineSpans(source: string, from: number, to: number): Span[] {
    const out: Span[] = [];
    let start = from;
    while (start <= to) {
        const nl = source.indexOf("\n", start);
        const end = nl === -1 || nl > to ? to : nl;
        out.push({ from: start, to: end });
        start = end + 1;
    }
    return out;
}

function blocks(source: string): Unit[] {
    const out: Unit[] = [];
    let para: Span | null = null;
    let fence: { from: number; info: string; } | null = null;
    const flushPara = () => {
        const s = para && trimSpan(source, para.from, para.to);
        if (s) out.push(s);
        para = null;
    };

    for (const line of lineSpans(source, 0, source.length)) {
        const text = source.slice(line.from, line.to);
        const lead = text.length - text.trimStart().length;
        const body = text.slice(lead);
        if (fence) {
            if (body.startsWith(FENCE)) {
                out.push({ from: fence.from, to: line.to, fence: fence.info });
                fence = null;
            }
            continue;
        }
        if (body.startsWith(FENCE) && !body.slice(FENCE.length).includes(FENCE)) {
            flushPara();
            fence = { from: line.from + lead, info: body.slice(FENCE.length).trim() };
            continue;
        }
        if (body.trim() === "") {
            flushPara();
            continue;
        }
        if (para) para.to = line.to;
        else para = { ...line };
    }
    if (fence) {
        const s = trimSpan(source, fence.from, source.length);
        if (s) out.push({ ...s, fence: fence.info });
    }
    flushPara();
    return out;
}

function cut(source: string, unit: Span, level: CutLevel): Span[] {
    const text = source.slice(unit.from, unit.to);
    const spans: (Span | null)[] = [];
    switch (level) {
        case "paragraph":
        case "line":
            for (const l of lineSpans(source, unit.from, unit.to)) spans.push(trimSpan(source, l.from, l.to));
            break;
        case "sentence":
            for (const s of sentenceSegmenter.segment(text))
                spans.push(trimSpan(source, unit.from + s.index, unit.from + s.index + s.segment.length));
            break;
        case "word":
            for (const m of text.matchAll(/\S+/g))
                spans.push({ from: unit.from + m.index, to: unit.from + m.index + m[0].length });
            break;
        case "grapheme":
            for (const g of graphemeSegmenter.segment(text))
                spans.push({ from: unit.from + g.index, to: unit.from + g.index + g.segment.length });
            break;
    }
    return spans.filter(s => s !== null);
}

class Planner {
    private readonly chunks: Chunk[] = [];
    private cur: Span | null = null;
    private readonly quoteAt: number;
    private readonly source: string;
    private readonly limit: number;

    constructor(source: string, limit: number) {
        this.source = source;
        this.limit = limit;
        this.quoteAt = source.search(/^>>> /m);
    }

    private quoteCarry(from: number): string {
        return this.quoteAt >= 0 && from > this.quoteAt ? QUOTE_CARRY : "";
    }

    private size(from: number, to: number): number {
        return this.quoteCarry(from).length + to - from;
    }

    private flush(boundary: Boundary) {
        const { cur } = this;
        if (!cur) return;
        const carry = this.quoteCarry(cur.from);
        this.chunks.push({ content: carry + this.source.slice(cur.from, cur.to), span: [cur.from, cur.to], carry, boundary });
        this.cur = null;
    }

    finish(): Chunk[] {
        this.flush("end");
        const { chunks } = this;
        if (chunks.length) chunks[chunks.length - 1] = { ...chunks[chunks.length - 1], boundary: "end" };
        return chunks;
    }

    pack(units: readonly Unit[], level: CutLevel) {
        for (const unit of units) {
            if (this.cur && this.size(this.cur.from, unit.to) <= this.limit) {
                this.cur.to = unit.to;
                continue;
            }
            this.flush(level);
            if (this.size(unit.from, unit.to) <= this.limit) {
                this.cur = { from: unit.from, to: unit.to };
                continue;
            }
            const next = NEXT_LEVEL[level];
            if (unit.fence !== undefined) this.packFence(unit, unit.fence);
            else if (next) this.pack(cut(this.source, unit, next), next);
            else this.cur = { from: unit.from, to: unit.to };
            this.flush(level);
        }
    }

    private packFence(unit: Span, info: string) {
        const { source } = this;
        const open = FENCE + info + "\n";
        const firstNl = source.indexOf("\n", unit.from);
        if (firstNl === -1 || firstNl >= unit.to) {
            this.cur = { from: unit.from, to: unit.to };
            return;
        }
        const lines = lineSpans(source, firstNl + 1, unit.to);
        const last = lines[lines.length - 1];
        const closed = lines.length > 1 && source.slice(last.from, last.to).trimStart().startsWith(FENCE);
        if (closed) lines.pop();

        const quote = this.quoteCarry(unit.from);
        const budget = this.limit - quote.length - open.length - FENCE_CLOSE.length;
        const units = lines.flatMap(l => l.to - l.from > budget ? cut(source, l, "grapheme") : [l]);

        const pieces: Span[] = [];
        let cur: Span | null = null;
        for (const u of units) {
            if (cur && u.to - cur.from <= budget) cur.to = u.to;
            else {
                if (cur) pieces.push(cur);
                cur = { ...u };
            }
        }
        if (cur) pieces.push(cur);

        pieces.forEach((piece, i) => {
            const isFirst = i === 0;
            const isLast = i === pieces.length - 1;
            const carry = isFirst ? quote : quote + open;
            this.chunks.push({
                content: quote + open + source.slice(piece.from, piece.to) + FENCE_CLOSE,
                span: [isFirst ? unit.from : piece.from, isLast ? unit.to : piece.to],
                carry,
                boundary: "fence",
            });
        });
    }
}

export function planMessages(source: string, limit: number): MessagePlan {
    const whole = trimSpan(source, 0, source.length);
    if (!whole) return { source, limit, chunks: [] };
    if (whole.to - whole.from <= limit) {
        return {
            source,
            limit,
            chunks: [{ content: source.slice(whole.from, whole.to), span: [whole.from, whole.to], carry: "", boundary: "end" }],
        };
    }
    const planner = new Planner(source, limit);
    planner.pack(blocks(source), "paragraph");
    return { source, limit, chunks: planner.finish() };
}

export function remainderAfter(plan: MessagePlan, sent: number): string {
    const next = plan.chunks[sent];
    return next ? next.carry + plan.source.slice(next.span[0]) : "";
}

export function sendLabel(messages: number): string {
    return messages > 1 ? `Send ${messages} messages` : "Send";
}
