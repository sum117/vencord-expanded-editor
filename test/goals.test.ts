import assert from "node:assert/strict";
import { test } from "node:test";

import { GOAL_DEFAULTS, goalCrossed, goalProgress, parseGoalChoice, settleGoals } from "../goals";

test("settleGoals clamps, snaps to 50 and sorts", () => {
    assert.deepEqual(settleGoals([3000, 20, 1234]), [100, 1250, 3000]);
    assert.deepEqual(settleGoals([999999, 2000, 1000]), [1000, 2000, 20000]);
});

test("settleGoals replaces junk with the slot default", () => {
    assert.deepEqual(settleGoals([NaN, "x", undefined]), GOAL_DEFAULTS);
    assert.deepEqual(settleGoals([]), GOAL_DEFAULTS);
});

test("goal progress clamps and reports reaching", () => {
    assert.equal(goalProgress(10, GOAL_DEFAULTS, null), null);
    assert.deepEqual(goalProgress(500, GOAL_DEFAULTS, 0), { target: 1000, words: 500, ratio: 0.5, reached: false });
    assert.deepEqual(goalProgress(2600, GOAL_DEFAULTS, 2), { target: 2500, words: 2600, ratio: 1, reached: true });
});

test("a goal is acknowledged once per target", () => {
    const reached = goalProgress(1000, GOAL_DEFAULTS, 0);
    assert.equal(goalCrossed(reached, null), true);
    assert.equal(goalCrossed(reached, 1000), false);
    assert.equal(goalCrossed(goalProgress(2000, GOAL_DEFAULTS, 1), 1000), true);
    assert.equal(goalCrossed(goalProgress(10, GOAL_DEFAULTS, 0), null), false);
});

test("a persisted goal choice survives only as a slot or none", () => {
    assert.equal(parseGoalChoice(2), 2);
    assert.equal(parseGoalChoice("2"), null);
    assert.equal(parseGoalChoice(undefined), null);
});
