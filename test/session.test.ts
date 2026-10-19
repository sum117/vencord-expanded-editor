import assert from "node:assert/strict";
import { test } from "node:test";

import { derive, type EditorState, initialState, keptText, keyAction, keyHint, KEYMAP, reduce } from "../session";
import { planMessages } from "../split";
import { stats } from "../text";

const long = Array.from({ length: 6 }, (_, i) => `P${i} ` + "word ".repeat(80).trim() + ".").join("\n\n");

function sending(text = long): EditorState {
    return reduce(initialState("c1", text), { type: "send/start", plan: planMessages(text, 1000) });
}

test("input is ignored while sending, and the plan is frozen", () => {
    const s = sending();
    assert.equal(reduce(s, { type: "input", text: "changed" }), s);
    assert.equal(reduce(s, { type: "send/start", plan: planMessages("other", 1000) }), s, "a second start is a no-op");
});

test("a failed send keeps exactly the unsent remainder", () => {
    let s = sending();
    s = reduce(s, { type: "send/chunk" });
    s = reduce(s, { type: "send/fail", reason: "429" });
    assert.equal(s.send.phase, "failed");
    const plan = planMessages(long, 1000);
    assert.equal(s.text, long.slice(plan.chunks[1].span[0]));
    const typed = reduce(s, { type: "input", text: s.text + "!" });
    assert.equal(typed.send.phase, "idle", "editing takes the remainder back");
});

test("keptText mid-send is the remainder, so closing never re-posts", () => {
    let s = sending();
    assert.equal(keptText(s), long);
    s = reduce(s, { type: "send/wait", until: 123 });
    s = reduce(s, { type: "send/chunk" });
    const plan = planMessages(long, 1000);
    assert.equal(keptText(s), long.slice(plan.chunks[1].span[0]));
    if (s.send.phase === "sending") assert.equal(s.send.resumeAt, null);
    s = reduce(s, { type: "send/done" });
    assert.equal(keptText(s), "");
});

test("a goal flash fires only when celebrating", () => {
    let s = initialState("c", "");
    s = reduce(s, { type: "goal/reached", target: 1000, celebrate: false });
    assert.deepEqual([s.acknowledgedGoal, s.goalFlash], [1000, 0]);
    s = reduce(s, { type: "goal/reached", target: 2000, celebrate: true });
    assert.deepEqual([s.acknowledgedGoal, s.goalFlash], [2000, 1]);
});

test("derive reports length as near, then as a split", () => {
    assert.equal(derive("a".repeat(1700), 2000, [1000, 2000, 2500], null).budget.tone, "quiet");
    assert.equal(derive("a".repeat(1800), 2000, [1000, 2000, 2500], null).budget.tone, "near");
    const split = derive(long, 1000, [1000, 2000, 2500], 0);
    assert.equal(split.budget.tone, "split");
    assert.ok(split.budget.messages > 1);
    assert.equal(split.progress?.target, 1000);
});

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; }> = {}) =>
    ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });

test("keys map to commands and formats per platform", () => {
    assert.deepEqual(keyAction(key("Enter", { ctrlKey: true }), false), { kind: "command", command: "send" });
    assert.deepEqual(keyAction(key("P", { ctrlKey: true, shiftKey: true }), false), { kind: "command", command: "togglePreview" });
    assert.deepEqual(keyAction(key("b", { ctrlKey: true }), false), { kind: "format", id: "bold" });
    assert.deepEqual(keyAction(key("b", { metaKey: true }), true), { kind: "format", id: "bold" });
    assert.equal(keyAction(key("b", { metaKey: true }), false), null);
    assert.equal(keyAction(key("b", { ctrlKey: true, altKey: true }), false), null);
    assert.equal(keyAction(key("Enter"), false), null);
    assert.equal(keyHint(KEYMAP[1], false), "Ctrl+Shift+P");
});

test("stats count words, characters and reading time", () => {
    assert.deepEqual(stats(""), { words: 0, chars: 0, readingMinutes: 0 });
    assert.deepEqual(stats("don't stop — now"), { words: 3, chars: 16, readingMinutes: 1 });
    assert.equal(stats("w ".repeat(460)).readingMinutes, 2);
});
