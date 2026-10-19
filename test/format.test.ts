import assert from "node:assert/strict";
import { test } from "node:test";

import { applyFormat, type Edit, type FormatId, insertBlock, minimalPatch, parseLine, quoteOf } from "../format";

/** "a [b] c" -> text with the selection marked by brackets, or "|" for a caret. */
function doc(marked: string): Edit {
    const caret = marked.indexOf("|");
    if (caret >= 0) return { text: marked.replace("|", ""), selection: { start: caret, end: caret } };
    const start = marked.indexOf("[");
    const end = marked.indexOf("]") - 1;
    return { text: marked.replace("[", "").replace("]", ""), selection: { start, end } };
}

function show({ text, selection: { start, end } }: Edit): string {
    if (start === end) return text.slice(0, start) + "|" + text.slice(start);
    return text.slice(0, start) + "[" + text.slice(start, end) + "]" + text.slice(end);
}

const fmt = (marked: string, id: FormatId) => {
    const d = doc(marked);
    return show(applyFormat(d.text, d.selection, id));
};

test("marks wrap the selection and toggling twice restores it", () => {
    assert.equal(fmt("say [hello] now", "bold"), "say **[hello]** now");
    assert.equal(fmt("say **[hello]** now", "bold"), "say [hello] now");
    assert.equal(fmt("say [**hello**] now", "bold"), "say [hello] now");
    for (const id of ["italic", "underline", "strike", "spoiler", "code"] as const) {
        const once = applyFormat("a b c", { start: 2, end: 3 }, id);
        const twice = applyFormat(once.text, once.selection, id);
        assert.deepEqual(twice, { text: "a b c", selection: { start: 2, end: 3 } }, id);
    }
});

test("italic and bold share the star without eating each other", () => {
    assert.equal(fmt("**[word]**", "italic"), "***[word]***");
    assert.equal(fmt("***[word]***", "italic"), "**[word]**");
    assert.equal(fmt("***[word]***", "bold"), "*[word]*");
    assert.equal(fmt("*[word]*", "bold"), "***[word]***");
});

test("marks hug the words, leaving edge spaces outside", () => {
    assert.equal(fmt("a[ big ]b", "bold"), "a **[big]** b");
});

test("a caret gets an empty pair, and a caret in an empty pair removes it", () => {
    assert.equal(fmt("hi |", "bold"), "hi **|**");
    assert.equal(fmt("hi **|**", "bold"), "hi |");
});

test("inline code around a backtick uses a doubled fence", () => {
    assert.equal(fmt("[a`b]", "code"), "`` [a`b] ``");
    assert.equal(fmt("`` [a`b] ``", "code"), "[a`b]");
});

test("heading cycles h1, h2, h3, plain, and replaces a bullet", () => {
    assert.equal(fmt("Ti|tle", "heading"), "# Ti|tle");
    assert.equal(fmt("# Ti|tle", "heading"), "## Ti|tle");
    assert.equal(fmt("## Ti|tle", "heading"), "### Ti|tle");
    assert.equal(fmt("### Ti|tle", "heading"), "Ti|tle");
    assert.equal(fmt("- it|em", "heading"), "# it|em");
    assert.equal(fmt("> - it|em", "heading"), "> # it|em");
});

test("a line format on an empty line puts the caret after the prefix", () => {
    assert.equal(fmt("one\n|", "list"), "one\n- |");
    assert.equal(fmt("|", "subtext"), "-# |");
    assert.equal(fmt("|\nsecond", "heading"), "# |\nsecond");
});

test("quote toggles every touched line, skips blank ones, and keeps the selection on the same words", () => {
    assert.equal(fmt("[one\n\ntwo]\nthree", "quote"), "> [one\n\n> two]\nthree");
    assert.equal(fmt("> [one\n\n> two]\nthree", "quote"), "[one\n\ntwo]\nthree");
    assert.equal(fmt("> one\nt[w]o", "quote"), "> one\n> t[w]o");
});

test("a selection ending at the next line's start does not touch that line", () => {
    assert.equal(fmt("[a\n]b", "list"), "- [a\n]b");
});

test("list and subtext set all lines, or clear when all have it", () => {
    assert.equal(fmt("[a\n- b]", "list"), "- [a\n- b]");
    assert.equal(fmt("[- a\n- b]", "list"), "[a\nb]");
    assert.equal(fmt("-# [a]", "subtext"), "[a]");
});

test("em dash opens dialogue at line start, joins mid-word", () => {
    assert.equal(fmt("|", "dash"), "— |");
    assert.equal(fmt("> |", "dash"), "> — |");
    assert.equal(fmt("wait|", "dash"), "wait—|");
    assert.equal(fmt("wait |", "dash"), "wait — |");
    assert.equal(fmt("a [xyz] b", "dash"), "a — | b");
});

test("parseLine reads quote, heading, subtext and list", () => {
    assert.deepEqual(parseLine("> ## T"), { quoted: true, kind: "h2", body: "T" });
    assert.deepEqual(parseLine("-# small"), { quoted: false, kind: "subtext", body: "small" });
    assert.deepEqual(parseLine(">>> x"), { quoted: false, kind: "plain", body: ">>> x" });
});

test("insertBlock sets the block on its own paragraph and puts the caret after it", () => {
    const at = (marked: string) => doc(marked);
    let d = at("first line|");
    assert.equal(show(insertBlock(d.text, d.selection, "> q")), "first line\n\n> q\n\n|");
    d = at("|");
    assert.equal(show(insertBlock(d.text, d.selection, "> q")), "> q\n\n|");
    d = at("a\n\n|\n\nb");
    assert.equal(show(insertBlock(d.text, d.selection, "> q")), "a\n\n> q\n\n|\n\nb");
});

test("quoteOf marks every line and names the author", () => {
    assert.equal(quoteOf("Ana", " hi\n\nthere \n"), "> **Ana**\n> hi\n> \n> there");
});

test("minimalPatch is the smallest replacement and keeps surrogate pairs whole", () => {
    const apply = (s: string, p: { from: number; to: number; insert: string; }) => s.slice(0, p.from) + p.insert + s.slice(p.to);
    const before = "the quick brown fox";
    const after = "the **quick** brown fox";
    assert.deepEqual(minimalPatch(before, after), { from: 4, to: 9, insert: "**quick**" });
    for (const [a, b] of [[before, after], ["\u{1F600}", "\u{1F601}"], ["abc", ""], ["", "abc"], ["aaa", "aaaa"]]) {
        const p = minimalPatch(a, b);
        assert.equal(apply(a, p), b);
        assert.doesNotMatch(p.insert, /^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
    }
});
