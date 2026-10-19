/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export type WordGoals = readonly [short: number, medium: number, long: number];
export type GoalSlot = 0 | 1 | 2;
/** `null` is "no goal". */
export type GoalChoice = GoalSlot | null;

export const GOAL_DEFAULTS: WordGoals = [1000, 2000, 2500];
export const GOAL_MIN = 100;
export const GOAL_MAX = 20000;
export const GOAL_STEP = 50;

export interface GoalProgress {
    readonly target: number;
    readonly words: number;
    /** 0..1, clamped. */
    readonly ratio: number;
    readonly reached: boolean;
}

function settleOne(value: unknown, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    const snapped = Math.round(value / GOAL_STEP) * GOAL_STEP;
    return Math.min(GOAL_MAX, Math.max(GOAL_MIN, snapped));
}

/** Clamp, snap to the step and sort, so slot 0 is always the shortest. Junk takes the slot's default. */
export function settleGoals(raw: readonly unknown[]): WordGoals {
    const [a, b, c] = GOAL_DEFAULTS.map((d, i) => settleOne(raw[i], d)).sort((x, y) => x - y);
    return [a, b, c];
}

export function goalProgress(words: number, goals: WordGoals, choice: GoalChoice): GoalProgress | null {
    if (choice === null) return null;
    const target = goals[choice];
    return { target, words, ratio: Math.min(1, words / target), reached: words >= target };
}

export function goalCrossed(progress: GoalProgress | null, acknowledged: number | null): boolean {
    return progress !== null && progress.reached && acknowledged !== progress.target;
}

export function parseGoalChoice(raw: unknown): GoalChoice {
    return raw === 0 || raw === 1 || raw === 2 ? raw : null;
}
