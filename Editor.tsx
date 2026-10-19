/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { EyeIcon, PencilIcon } from "@components/Icons";
import { IS_MAC } from "@utils/constants";
import { classes } from "@utils/misc";
import { React, useEffect, useMemo, useRef } from "@webpack/common";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

import { CalmIcon, cl, FailedNotice, GoalPicker, IconButton, Meter, RecentIcon, ReplyChip, Segmented, SendButton, Status, Toolbar, TypePicker, Whisper } from "./chrome";
import { Column, type ColumnHandle } from "./Column";
import { quoteOf } from "./format";
import { goalCrossed, parseGoalChoice } from "./goals";
import { cancelReply, channelLabel, messageLimit, type RecentMessage, usePendingReply } from "./ports";
import { RecentPanel } from "./RecentPanel";
import { derive, keyAction, keyHint, KEYMAP, type View } from "./session";
import { FACES, readFace, readFontSize, readGoals, settings } from "./settings";
import type { Session, Snapshot } from "./surface";

const hintFor = (command: string) => keyHint(KEYMAP.find(k => k.command === command)!, IS_MAC);

export function Editor({ session, snapshot }: { session: Session; snapshot: Snapshot; }): ReactNode {
    const { state } = snapshot;
    const prefs = settings.use(["face", "fontSize", "goal", "goalShort", "goalMedium", "goalLong", "recentOpen"]);
    const column = useRef<ColumnHandle>(null);
    const workspace = useRef<HTMLDivElement>(null);
    const limit = useMemo(messageLimit, []);
    const text = React.useDeferredValue(state.text);
    const goals = readGoals(prefs);
    const goal = parseGoalChoice(prefs.goal);
    const derived = useMemo(() => derive(text, limit, goals, goal), [text, limit, goal, ...goals]);
    const { progress } = derived;
    const label = useMemo(() => channelLabel(state.channelId), [state.channelId]);
    const reply = usePendingReply(state.channelId);
    const sending = state.send.phase === "sending";

    const lastWords = useRef<number | null>(null);
    useEffect(() => {
        if (progress && goalCrossed(progress, state.acknowledgedGoal)) {
            const before = lastWords.current;
            session.dispatch({ type: "goal/reached", target: progress.target, celebrate: before !== null && before < progress.target });
        }
        lastWords.current = derived.stats.words;
    }, [derived.stats.words, progress?.target]);

    const calmEntries = useRef({ count: 0, flashAtEntry: 0 });
    const wasCalm = useRef(false);
    if (state.calm && !wasCalm.current) calmEntries.current = { count: calmEntries.current.count + 1, flashAtEntry: state.goalFlash };
    wasCalm.current = state.calm;
    const calmFlash = state.goalFlash > calmEntries.current.flashAtEntry ? state.goalFlash : 0;

    const face = FACES[readFace(prefs.face)];
    const typeVars = {
        "--vc-ee-font": face.stack,
        "--vc-ee-size": `${readFontSize(prefs.fontSize)}px`,
        "--vc-ee-leading": face.leading,
        "--vc-ee-measure": face.measure,
    } as CSSProperties;

    const setView = (view: View) => session.dispatch({ type: "view", view });
    const setCalm = (on: boolean) => session.dispatch({ type: "calm", on });
    const setGoal = (choice: typeof goal) => { settings.store.goal = choice; };
    const setTyping = (on: boolean) => {
        const el = workspace.current;
        if (el && (el.dataset.typing !== undefined) !== on) el.toggleAttribute("data-typing", on);
    };

    function quote(message: RecentMessage) {
        const block = quoteOf(message.authorName, message.content);
        if (state.view === "write") {
            column.current?.insertBlock(block);
            return;
        }
        setView("write");
        setTimeout(() => column.current?.insertBlock(block));
    }

    function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
        const action = keyAction(e, IS_MAC);
        if (!action) return;
        e.preventDefault();
        if (action.kind === "format") {
            column.current?.format(action.id);
            return;
        }
        switch (action.command) {
            case "togglePreview":
                setView(state.view === "write" ? "preview" : "write");
                break;
            case "toggleCalm":
                setCalm(!state.calm);
                break;
            case "send":
                session.send();
                break;
        }
    }

    return (
        <div
            ref={workspace}
            className={cl("workspace")}
            data-view={state.view}
            data-calm={state.calm || undefined}
            style={typeVars}
            onKeyDown={onKeyDown}
            onMouseMove={() => setTyping(false)}
        >
            {state.calm ? (
                <header className={classes(cl("calm-bar"), cl("bar"))}>
                    <BaseText tag="span" size="xs" weight="medium" defaultColor={false} className={cl("calm-label")}>Calm</BaseText>
                    <GoalPicker goals={goals} choice={goal} onChange={setGoal} />
                    <Button variant="secondary" size="small" onClick={() => setCalm(false)}>Leave calm</Button>
                    {progress && <Meter progress={progress} />}
                </header>
            ) : (
                <header className={classes(cl("header"), cl("bar"))}>
                    <div className={cl("header-start")}>
                        <PencilIcon className={cl("header-icon")} width={20} height={20} />
                        <BaseText size="md" weight="semibold" className={cl("title")}>{label}</BaseText>
                        {reply && <ReplyChip reply={reply} onCancel={() => cancelReply(state.channelId)} />}
                    </div>
                    <div className={cl("header-tools")}>
                        <div className={cl("toolbar-slot")} data-hidden={state.view !== "write" || undefined}>
                            <Toolbar disabled={state.view !== "write" || sending} onFormat={id => column.current?.format(id)} />
                        </div>
                        <Segmented<View>
                            label="View"
                            value={state.view}
                            onChange={setView}
                            options={[
                                { value: "write", label: <><PencilIcon width={16} height={16} />Write</>, title: hintFor("togglePreview") },
                                { value: "preview", label: <><EyeIcon width={16} height={16} />Preview</>, title: hintFor("togglePreview") },
                            ]}
                        />
                        <TypePicker
                            face={readFace(prefs.face)}
                            size={readFontSize(prefs.fontSize)}
                            onFace={f => { settings.store.face = f; }}
                            onSize={s => { settings.store.fontSize = s; }}
                        />
                        <IconButton label="Recent messages" pressed={!!prefs.recentOpen} onClick={() => { settings.store.recentOpen = !prefs.recentOpen; }}>
                            <RecentIcon />
                        </IconButton>
                        <IconButton label="Calm" hint={hintFor("toggleCalm")} onClick={() => setCalm(true)}>
                            <CalmIcon />
                        </IconButton>
                    </div>
                    {progress && <Meter progress={progress} />}
                </header>
            )}
            <Column
                ref={column}
                state={state}
                plan={derived.plan}
                placeholder={`Message ${label}`}
                onInput={t => {
                    setTyping(true);
                    session.dispatch({ type: "input", text: t });
                }}
            />
            {prefs.recentOpen && !state.calm && (
                <ErrorBoundary noop>
                    <RecentPanel channelId={state.channelId} onQuote={quote} />
                </ErrorBoundary>
            )}
            {state.calm ? (
                <Whisper words={derived.stats.words} progress={progress} flash={calmFlash} entered={calmEntries.current.count} />
            ) : (
                <footer className={classes(cl("footer"), cl("bar"))}>
                    {state.send.phase === "failed" && (
                        <FailedNotice send={state.send} onRetry={() => session.send()} onDismiss={() => session.dispatch({ type: "send/dismiss" })} />
                    )}
                    <div className={cl("footer-start")}>
                        <Status derived={derived} />
                        <GoalPicker goals={goals} choice={goal} onChange={setGoal} />
                        {progress?.reached && <BaseText tag="span" size="sm" defaultColor={false} className={cl("goal-reached")}>Goal reached</BaseText>}
                    </div>
                    <div className={cl("footer-end")}>
                        <BaseText tag="span" size="xs" defaultColor={false} className={cl("saved")} data-pending={!snapshot.saved || undefined}>
                            Draft saved
                        </BaseText>
                        <BaseText tag="span" size="xs" defaultColor={false} className={cl("hint")}>
                            {sending ? "Esc stops before the next message" : `${hintFor("send")} send · Esc close`}
                        </BaseText>
                        <Button variant="secondary" size="small" onClick={() => void session.close()}>Close</Button>
                        <SendButton send={state.send} messages={derived.budget.messages} onSend={() => session.send()} />
                    </div>
                </footer>
            )}
        </div>
    );
}
