/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { TextButton } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { classes } from "@utils/misc";
import { Timestamp, useLayoutEffect, useRef } from "@webpack/common";
import type { ReactNode } from "react";

import { cl } from "./chrome";
import { messageMarkupClass, type RecentMessage, renderMarkdown, useRecentMessages } from "./ports";

const RECENT_COUNT = 20;

export function RecentPanel({ channelId, onQuote }: { channelId: string; onQuote(message: RecentMessage): void; }): ReactNode {
    const messages = useRecentMessages(channelId, RECENT_COUNT);
    const scroller = useRef<HTMLDivElement>(null);
    const markup = messageMarkupClass();

    useLayoutEffect(() => {
        const el = scroller.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages.at(-1)?.id]);

    return (
        <aside className={cl("aside")} aria-label="Recent messages">
            <BaseText size="xs" weight="semibold" defaultColor={false} className={cl("aside-title")}>Recent messages</BaseText>
            <div ref={scroller} className={cl("aside-scroller")}>
                {messages.length === 0 && <BaseText size="sm" defaultColor={false} className={cl("aside-empty")}>No messages loaded for this channel.</BaseText>}
                {messages.map(m => (
                    <article key={m.id} className={cl("recent")}>
                        <div className={cl("recent-head")}>
                            <BaseText tag="span" size="sm" weight="semibold" className={cl("recent-author")}>{m.authorName}</BaseText>
                            <ErrorBoundary noop>
                                <span className={cl("recent-time")}><Timestamp timestamp={m.timestamp} compact={false} isInline={false} /></span>
                            </ErrorBoundary>
                            <TextButton variant="secondary" className={cl("recent-quote")} onClick={() => onQuote(m)}>Quote</TextButton>
                        </div>
                        <div className={classes(markup, cl("recent-body"))}>{renderMarkdown(m.content, channelId)}</div>
                    </article>
                ))}
            </div>
        </aside>
    );
}
