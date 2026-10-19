/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { EyeIcon, PencilIcon } from "@components/Icons";
import { IS_MAC } from "@utils/constants";
import { React, useMemo, useRef } from "@webpack/common";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

import { cl, Segmented, Toolbar, TypePicker } from "./chrome";
import { Column, type ColumnHandle } from "./Column";
import { channelLabel, messageLimit } from "./ports";
import { derive, keyAction, type View } from "./session";
import { FACES, readFace, readFontSize, readGoals, settings } from "./settings";
import type { Session, Snapshot } from "./surface";

export function Editor({ session, snapshot }: { session: Session; snapshot: Snapshot; }): ReactNode {
    const { state } = snapshot;
    const prefs = settings.use(["face", "fontSize", "goal", "goalShort", "goalMedium", "goalLong"]);
    const column = useRef<ColumnHandle>(null);
    const limit = useMemo(messageLimit, []);
    const text = React.useDeferredValue(state.text);
    const goals = readGoals(prefs);
    const derived = useMemo(() => derive(text, limit, goals, null), [text, limit, ...goals]);
    const label = useMemo(() => channelLabel(state.channelId), [state.channelId]);

    const face = FACES[readFace(prefs.face)];
    const typeVars = {
        "--vc-ee-font": face.stack,
        "--vc-ee-size": `${readFontSize(prefs.fontSize)}px`,
        "--vc-ee-leading": face.leading,
        "--vc-ee-measure": face.measure,
    } as CSSProperties;

    const setView = (view: View) => session.dispatch({ type: "view", view });

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
                session.dispatch({ type: "calm", on: !state.calm });
                break;
            case "send":
                session.send();
                break;
        }
    }

    return (
        <div className={cl("workspace")} data-view={state.view} style={typeVars} onKeyDown={onKeyDown}>
            <header className={cl("header")}>
                <div className={cl("header-start")}>
                    <PencilIcon className={cl("header-icon")} width={20} height={20} />
                    <BaseText size="md" weight="semibold" className={cl("title")}>{label}</BaseText>
                </div>
                <div className={cl("header-tools")}>
                    <div className={cl("toolbar-slot")} data-hidden={state.view !== "write" || undefined}>
                        <Toolbar disabled={state.view !== "write"} onFormat={id => column.current?.format(id)} />
                    </div>
                    <Segmented<View>
                        label="View"
                        value={state.view}
                        onChange={setView}
                        options={[
                            { value: "write", label: <><PencilIcon width={16} height={16} />Write</> },
                            { value: "preview", label: <><EyeIcon width={16} height={16} />Preview</> },
                        ]}
                    />
                    <TypePicker
                        face={readFace(prefs.face)}
                        size={readFontSize(prefs.fontSize)}
                        onFace={f => { settings.store.face = f; }}
                        onSize={s => { settings.store.fontSize = s; }}
                    />
                    <Button variant="secondary" size="small" onClick={() => void session.close()}>Close</Button>
                </div>
            </header>
            <Column
                ref={column}
                state={state}
                plan={derived.plan}
                placeholder={`Message ${label}`}
                onInput={t => session.dispatch({ type: "input", text: t })}
            />
        </div>
    );
}
