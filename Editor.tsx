/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { PencilIcon } from "@components/Icons";
import type { ReactNode } from "react";

import { cl } from "./chrome";
import { channelLabel } from "./ports";
import type { Session, Snapshot } from "./surface";

export function Editor({ session, snapshot }: { session: Session; snapshot: Snapshot; }): ReactNode {
    const { state } = snapshot;
    return (
        <div className={cl("workspace")}>
            <header className={cl("header")}>
                <div className={cl("header-start")}>
                    <PencilIcon className={cl("header-icon")} width={20} height={20} />
                    <BaseText size="md" weight="semibold" className={cl("title")}>{channelLabel(state.channelId)}</BaseText>
                </div>
                <div className={cl("header-end")}>
                    <Button variant="secondary" size="small" onClick={() => void session.close()}>Close</Button>
                </div>
            </header>
            <div className={cl("body")} />
        </div>
    );
}
