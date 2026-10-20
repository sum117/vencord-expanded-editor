/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 sum117
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { type MessagePlan, planMessages, remainderAfter, sendLabel } from "../split";

const squash = (s: string) => s.replace(/\s+/g, "");
const fenceCount = (s: string) => s.split("```").length - 1;

function assertPlanInvariants(plan: MessagePlan) {
    let last = -1;
    for (const c of plan.chunks) {
        assert.ok(c.content.length > 0, "chunk is non-empty");
        assert.ok(c.content.length <= plan.limit, `chunk ${c.content.length} <= ${plan.limit}`);
        assert.ok(c.span[0] >= last, "spans ascend");
        last = c.span[1];
        assert.equal(fenceCount(c.content) % 2, 0, "every fence in a chunk is closed");
        assert.doesNotMatch(c.content, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/, "no lone surrogate");
    }
    const covered = plan.chunks.map(c => plan.source.slice(c.span[0], c.span[1])).join("");
    assert.equal(squash(covered), squash(plan.source), "spans cover the source, nothing dropped or doubled");
}

const para = (n: number, word = "word") => Array.from({ length: n }, () => word).join(" ") + ".";

test("blank text plans no messages", () => {
    assert.deepEqual(planMessages("  \n\n ", 2000).chunks, []);
    assert.equal(sendLabel(0), "Send");
});

test("text that fits is one trimmed message", () => {
    const plan = planMessages("\n  hello **world**  \n", 2000);
    assert.equal(plan.chunks.length, 1);
    assert.equal(plan.chunks[0].content, "hello **world**");
    assert.deepEqual(plan.chunks[0].span, [3, 18]);
    assert.equal(sendLabel(1), "Send");
});

test("long text is cut between paragraphs, keeping paragraphs whole", () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => `P${i} ` + para(60));
    const source = paragraphs.join("\n\n");
    const plan = planMessages(source, 2000);
    assertPlanInvariants(plan);
    assert.ok(plan.chunks.length >= 2);
    for (const c of plan.chunks) {
        assert.match(c.content, /^P\d+ /, "a chunk starts at a paragraph");
        assert.match(c.content, /\.$/, "a chunk ends at a paragraph end");
    }
    assert.equal(sendLabel(plan.chunks.length), `Send ${plan.chunks.length} messages`);
});

test("an oversized paragraph is cut at sentence ends", () => {
    const sentences = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} goes on for a while, then it ends here.`);
    const plan = planMessages(sentences.join(" "), 500);
    assertPlanInvariants(plan);
    for (const c of plan.chunks) assert.match(c.content, /\.$/, "cut after a sentence");
    assert.equal(plan.chunks[0].boundary, "sentence");
    assert.equal(plan.chunks.at(-1)!.boundary, "end");
});

test("a fenced block that fits is never cut", () => {
    const code = "```js\n" + Array.from({ length: 10 }, (_, i) => `const v${i} = ${i};`).join("\n") + "\n```";
    const source = para(300, "aa") + "\n\n" + code + "\n\n" + para(20);
    const plan = planMessages(source, 1000);
    assertPlanInvariants(plan);
    assert.ok(plan.chunks.some(c => c.content.includes(code)), "the fence travels whole");
});

test("an oversized fence is cut at lines and re-fenced with its info string", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i} of the code block`);
    const source = "Intro.\n\n```py\n" + lines.join("\n") + "\n```\n\nOutro.";
    const plan = planMessages(source, 2000);
    assertPlanInvariants(plan);
    const fenced = plan.chunks.filter(c => c.content.startsWith("```py\n"));
    assert.ok(fenced.length >= 3, "several fenced pieces");
    for (const c of fenced) assert.ok(c.content.endsWith("\n```"));
    assert.equal(squash(fenced.map(c => c.content.slice(6, -4)).join("\n")), squash(lines.join("")));
});

test("remainder after a partial send is the exact source tail", () => {
    const paragraphs = Array.from({ length: 6 }, (_, i) => `P${i}  ` + para(80));
    const source = paragraphs.join("\n\n\n");
    const plan = planMessages(source, 1000);
    assert.ok(plan.chunks.length >= 3);
    const rest = remainderAfter(plan, 1);
    assert.equal(rest, source.slice(plan.chunks[1].span[0]));
    assert.ok(source.endsWith(rest));
    assert.equal(remainderAfter(plan, 0), source.slice(plan.chunks[0].span[0]));
    assert.equal(remainderAfter(plan, plan.chunks.length), "");
});

test("a remainder starting inside a cut fence reopens it", () => {
    const lines = Array.from({ length: 200 }, (_, i) => `x${i} = ${i}`);
    const source = "```rs\n" + lines.join("\n") + "\n```";
    const plan = planMessages(source, 500);
    const rest = remainderAfter(plan, 1);
    assert.ok(rest.startsWith("```rs\n"));
    assert.ok(rest.endsWith("\n```"));
    assert.equal(fenceCount(rest), 2);
});

test("a >>> quote that continues into the next message repeats its marker", () => {
    const source = ">>> " + Array.from({ length: 8 }, () => para(70)).join("\n\n");
    const plan = planMessages(source, 1000);
    assertPlanInvariants(plan);
    for (const c of plan.chunks) assert.ok(c.content.startsWith(">>> "), "each message is quoted");
    assert.ok(remainderAfter(plan, 1).startsWith(">>> "));
});

test("an unbreakable run is cut at graphemes, never inside an emoji", () => {
    const source = "\u{1F600}".repeat(1500);
    const plan = planMessages(source, 2000);
    assertPlanInvariants(plan);
    assert.equal(plan.chunks.length, 2);
    assert.equal(plan.chunks[0].boundary, "grapheme");
});
