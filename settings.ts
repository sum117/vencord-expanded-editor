/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { GOAL_DEFAULTS, GOAL_MAX, GOAL_MIN, type GoalChoice, settleGoals, type WordGoals } from "./goals";

export type FaceId = "discord" | "serif" | "writer" | "mono";

export interface Face {
    readonly label: string;
    readonly stack: string;
    readonly leading: number;
    /**
     * Line length. Measured live at 17px with a 71-character English ruler:
     * gg sans 30.4em, Noto Serif 34.1em, iA Writer Quattro 38.7em, gg mono
     * 42.6em; each value below holds about 70 characters a line.
     */
    readonly measure: string;
}

/** One table drives the setting, the in-editor picker and the column's CSS variables. */
export const FACES: Readonly<Record<FaceId, Face>> = {
    discord: {
        label: "Discord",
        stack: 'var(--font-primary, "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif)',
        leading: 1.6,
        measure: "30em",
    },
    serif: {
        label: "Serif",
        stack: '"Literata", "Charter", "Bitstream Charter", "Source Serif 4", "Iowan Old Style", "Noto Serif", Georgia, serif',
        leading: 1.65,
        measure: "33.5em",
    },
    writer: {
        label: "Writer",
        stack: '"iA Writer Quattro S", "iA Writer Quattro V", "iA Writer Duo S", var(--font-code, monospace)',
        leading: 1.6,
        measure: "38em",
    },
    mono: {
        label: "Mono",
        stack: 'var(--font-code, "gg mono", "JetBrains Mono", Consolas, monospace)',
        leading: 1.55,
        measure: "70ch",
    },
};

export const FONT_SIZES = [15, 16, 17, 18, 20, 22] as const;

const goalSetting = (label: string, slot: 0 | 1 | 2) => ({
    type: OptionType.NUMBER,
    description: `${label} word goal (${GOAL_MIN}-${GOAL_MAX}, rounded to 50)`,
    default: GOAL_DEFAULTS[slot],
    isValid: (v: number) => Number.isFinite(v) && v >= GOAL_MIN && v <= GOAL_MAX || `Between ${GOAL_MIN} and ${GOAL_MAX}`,
} as const);

export const settings = definePluginSettings({
    face: {
        type: OptionType.SELECT,
        description: "Typeface of the writing column",
        options: (Object.keys(FACES) as FaceId[]).map(id => ({ label: FACES[id].label, value: id, default: id === "discord" })),
    },
    fontSize: {
        type: OptionType.SLIDER,
        description: "Text size of the writing column, in pixels",
        markers: [...FONT_SIZES],
        default: 17,
        stickToMarkers: true,
    },
    goalShort: goalSetting("Short", 0),
    goalMedium: goalSetting("Medium", 1),
    goalLong: goalSetting("Long", 2),
    goal: {
        type: OptionType.CUSTOM,
        default: null as GoalChoice,
    },
    recentOpen: {
        type: OptionType.CUSTOM,
        default: false,
    },
});

export function readGoals(s: { goalShort: number; goalMedium: number; goalLong: number; }): WordGoals {
    return settleGoals([s.goalShort, s.goalMedium, s.goalLong]);
}

export function readFace(raw: unknown): FaceId {
    return typeof raw === "string" && raw in FACES ? raw as FaceId : "discord";
}

export function readFontSize(raw: unknown): number {
    return typeof raw === "number" && raw >= FONT_SIZES[0] && raw <= FONT_SIZES[FONT_SIZES.length - 1] ? raw : 17;
}
