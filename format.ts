/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/** A caret or selection in UTF-16 offsets, start <= end. */
export interface Selection {
    readonly start: number;
    readonly end: number;
}

/** A transform's result: the next text and where the selection lands. */
export interface Edit {
    readonly text: string;
    readonly selection: Selection;
}

/** Replace [from, to) of the current text with `insert`. */
export interface Patch {
    readonly from: number;
    readonly to: number;
    readonly insert: string;
}

export type MarkId = "bold" | "italic" | "underline" | "strike" | "spoiler" | "code";
export type LineFormatId = "heading" | "subtext" | "quote" | "list";
export type FormatId = MarkId | LineFormatId | "dash";

export interface FormatSpec {
    readonly id: FormatId;
    readonly glyph: string;
    readonly label: string;
    readonly key?: "b" | "i" | "u";
    /** Toolbar group; a hairline separates groups. */
    readonly group: 0 | 1 | 2;
}

/** The one list the toolbar, its tooltips, the shortcuts and applyFormat derive from. */
export const FORMATS: readonly FormatSpec[] = [
    { id: "bold", glyph: "B", label: "Bold", key: "b", group: 0 },
    { id: "italic", glyph: "I", label: "Italic", key: "i", group: 0 },
    { id: "underline", glyph: "U", label: "Underline", key: "u", group: 0 },
    { id: "strike", glyph: "S", label: "Strikethrough", group: 0 },
    { id: "spoiler", glyph: "||", label: "Spoiler", group: 0 },
    { id: "code", glyph: "`", label: "Inline code", group: 0 },
    { id: "heading", glyph: "H", label: "Heading (repeat for smaller)", group: 1 },
    { id: "subtext", glyph: "-#", label: "Subtext", group: 1 },
    { id: "quote", glyph: "“", label: "Quote", group: 1 },
    { id: "list", glyph: "•", label: "List", group: 1 },
    { id: "dash", glyph: "—", label: "Em dash", group: 2 },
];

export const FORMAT_BY_KEY: ReadonlyMap<string, FormatId> = new Map(
    FORMATS.flatMap(f => f.key ? [[f.key, f.id] as const] : [])
);

const MARKS: Record<MarkId, string> = {
    bold: "**",
    italic: "*",
    underline: "__",
    strike: "~~",
    spoiler: "||",
    code: "`",
};

const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c);

function runBefore(text: string, at: number, ch: string): number {
    let n = 0;
    while (at - n - 1 >= 0 && text[at - n - 1] === ch) n++;
    return n;
}

function runAfter(text: string, at: number, ch: string, limit = text.length): number {
    let n = 0;
    while (at + n < limit && text[at + n] === ch) n++;
    return n;
}

/**
 * Whether runs of the marker's character on both sides carry the mark. "*"
 * is italic only in an odd run (`**` is bold, `***` is both); doubled markers
 * need a run of at least two.
 */
function carries(marker: string, left: number, right: number): boolean {
    const run = Math.min(left, right);
    return marker === "*" ? run % 2 === 1 : run >= marker.length;
}

function replace(text: string, from: number, to: number, insert: string): string {
    return text.slice(0, from) + insert + text.slice(to);
}

function toggleMark(text: string, selection: Selection, id: MarkId): Edit {
    let { start, end } = selection;
    while (start < end && isSpace(text[start])) start++;
    while (end > start && isSpace(text[end - 1])) end--;
    const selected = text.slice(start, end);
    const marker = id === "code" && selected.includes("`") ? "``" : MARKS[id];
    const m = marker.length;
    const ch = marker[0];

    if (id === "code" && text.slice(start - 3, start) === "`` " && text.slice(end, end + 3) === " ``") {
        const next = replace(replace(text, end, end + 3, ""), start - 3, start, "");
        return { text: next, selection: { start: start - 3, end: end - 3 } };
    }

    if (carries(marker, runBefore(text, start, ch), runAfter(text, end, ch))) {
        const next = replace(replace(text, end, end + m, ""), start - m, start, "");
        return { text: next, selection: { start: start - m, end: end - m } };
    }

    if (start < end) {
        const inLeft = runAfter(text, start, ch, end);
        const inRight = runBefore(text.slice(0, end), end, ch);
        if (inLeft < end - start && carries(marker, inLeft, inRight)) {
            const next = replace(replace(text, end - m, end, ""), start, start + m, "");
            return { text: next, selection: { start, end: end - 2 * m } };
        }
    }

    const [open, close] = marker === "``" ? ["`` ", " ``"] : [marker, marker];
    const next = text.slice(0, start) + open + selected + close + text.slice(end);
    return { text: next, selection: { start: start + open.length, end: end + open.length } };
}

export type LineKind = "plain" | "h1" | "h2" | "h3" | "subtext" | "list";

export interface ParsedLine {
    readonly quoted: boolean;
    readonly kind: LineKind;
    /** The text after both prefixes. */
    readonly body: string;
}

const KIND_PREFIX: Record<LineKind, string> = {
    plain: "",
    h1: "# ",
    h2: "## ",
    h3: "### ",
    subtext: "-# ",
    list: "- ",
};

const PARSE_ORDER: readonly (readonly [LineKind, string])[] = [
    ["h3", "### "],
    ["h2", "## "],
    ["h1", "# "],
    ["subtext", "-# "],
    ["list", "- "],
    ["list", "* "],
];

/** Discord allows one quote around one line kind (`> ## Title`, `> - item`); heading, subtext and list exclude each other. */
export function parseLine(line: string): ParsedLine {
    let rest = line;
    let quoted = false;
    if (rest.startsWith("> ")) {
        quoted = true;
        rest = rest.slice(2);
    } else if (rest === ">") {
        quoted = true;
        rest = "";
    }
    for (const [kind, prefix] of PARSE_ORDER)
        if (rest.startsWith(prefix)) return { quoted, kind, body: rest.slice(prefix.length) };
    return { quoted, kind: "plain", body: rest };
}

export function printLine(line: ParsedLine): string {
    return (line.quoted ? "> " : "") + KIND_PREFIX[line.kind] + line.body;
}

const NEXT_HEADING: Record<LineKind, LineKind> = { plain: "h1", subtext: "h1", list: "h1", h1: "h2", h2: "h3", h3: "plain" };

function toggleLines(text: string, selection: Selection, id: LineFormatId): Edit {
    const regionStart = text.lastIndexOf("\n", selection.start - 1) + 1;
    const lastAt = selection.end > selection.start && text[selection.end - 1] === "\n" ? selection.end - 1 : selection.end;
    const nl = text.indexOf("\n", lastAt);
    const regionEnd = nl === -1 ? text.length : nl;

    const lines = text.slice(regionStart, regionEnd).split("\n");
    const parsed = lines.map(parseLine);
    let targets = parsed.flatMap((p, i) => p.body.trim() !== "" || p.kind !== "plain" ? [i] : []);
    if (!targets.length) targets = parsed.map((_, i) => i);
    const hit = targets.map(i => parsed[i]);

    const next = [...parsed];
    const set = (patch: (p: ParsedLine) => ParsedLine) => targets.forEach(i => { next[i] = patch(parsed[i]); });
    switch (id) {
        case "quote": {
            const quoted = !hit.every(p => p.quoted);
            set(p => ({ ...p, quoted }));
            break;
        }
        case "heading": {
            const kind = NEXT_HEADING[hit[0].kind];
            set(p => ({ ...p, kind }));
            break;
        }
        case "subtext":
        case "list": {
            const kind: LineKind = hit.every(p => p.kind === id) ? "plain" : id;
            set(p => ({ ...p, kind }));
            break;
        }
    }

    const printed = next.map(printLine);
    const oldStarts: number[] = [];
    const newStarts: number[] = [];
    for (let i = 0, o = regionStart, n = regionStart; i < lines.length; i++) {
        oldStarts.push(o);
        newStarts.push(n);
        o += lines[i].length + 1;
        n += printed[i].length + 1;
    }
    const totalDelta = printed.join("\n").length - (regionEnd - regionStart);
    const map = (pos: number) => {
        if (pos > regionEnd) return pos + totalDelta;
        let i = lines.length - 1;
        while (i > 0 && oldStarts[i] > pos) i--;
        const offset = pos - oldStarts[i];
        const oldPrefix = lines[i].length - parsed[i].body.length;
        const newPrefix = printed[i].length - next[i].body.length;
        return newStarts[i] + (offset <= oldPrefix ? newPrefix : offset - oldPrefix + newPrefix);
    };

    return {
        text: text.slice(0, regionStart) + printed.join("\n") + text.slice(regionEnd),
        selection: { start: map(selection.start), end: map(selection.end) },
    };
}

/** At a line's start (after an optional quote) or after a space, the dash opens a phrase: "— ". */
function insertDash(text: string, selection: Selection): Edit {
    const before = text.slice(0, selection.start);
    const head = before.slice(before.lastIndexOf("\n") + 1);
    const insert = head === "" || head === "> " || before.endsWith(" ") ? "— " : "—";
    const caret = selection.start + insert.length;
    return { text: replace(text, selection.start, selection.end, insert), selection: { start: caret, end: caret } };
}

/** Pure. Pressing the same mark twice returns the original text and selection. */
export function applyFormat(text: string, selection: Selection, id: FormatId): Edit {
    switch (id) {
        case "bold":
        case "italic":
        case "underline":
        case "strike":
        case "spoiler":
        case "code":
            return toggleMark(text, selection, id);
        case "heading":
        case "subtext":
        case "quote":
        case "list":
            return toggleLines(text, selection, id);
        case "dash":
            return insertDash(text, selection);
    }
}

/** Replaces the selection with `block` as its own paragraph and opens an empty paragraph after it for the caret. */
export function insertBlock(text: string, selection: Selection, block: string): Edit {
    const before = text.slice(0, selection.start).replace(/\s+$/, "");
    const after = text.slice(selection.end).replace(/^\s+/, "");
    const head = (before ? before + "\n\n" : "") + block + "\n\n";
    return { text: head + (after ? "\n\n" + after : ""), selection: { start: head.length, end: head.length } };
}

/** A message quoted into the draft: the author in bold, then the body, every line marked. */
export function quoteOf(author: string, content: string): string {
    const lines = content.trim().split("\n").map(l => l.trim() ? `> ${l}` : "> ");
    return [`> **${author}**`, ...lines].join("\n");
}

const isHigh = (c: number) => c >= 0xD800 && c <= 0xDBFF;
const isLow = (c: number) => c >= 0xDC00 && c <= 0xDFFF;

/** The smallest replacement turning `before` into `after`, never splitting a surrogate pair. */
export function minimalPatch(before: string, after: string): Patch {
    const max = Math.min(before.length, after.length);
    let p = 0;
    while (p < max && before[p] === after[p]) p++;
    if (p > 0 && isHigh(before.charCodeAt(p - 1))) p--;
    let s = 0;
    while (s < max - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
    if (s > 0 && isLow(before.charCodeAt(before.length - s))) s--;
    return { from: p, to: before.length - s, insert: after.slice(p, after.length - s) };
}
