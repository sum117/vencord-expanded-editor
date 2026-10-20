/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface Stats {
    readonly words: number;
    readonly chars: number;
    readonly readingMinutes: number;
}

export const READING_WPM = 230;

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });

export function countWords(text: string): number {
    let n = 0;
    for (const s of wordSegmenter.segment(text)) if (s.isWordLike) n++;
    return n;
}

export function stats(text: string): Stats {
    const words = countWords(text);
    return {
        words,
        chars: text.length,
        readingMinutes: words === 0 ? 0 : Math.max(1, Math.round(words / READING_WPM)),
    };
}

export const isSpace = (c: string | undefined) => c !== undefined && /\s/.test(c);

export const formatCount = (n: number) => n.toLocaleString();

export function formatReadingTime(minutes: number): string {
    return minutes <= 1 ? "1 min read" : `${minutes} min read`;
}
