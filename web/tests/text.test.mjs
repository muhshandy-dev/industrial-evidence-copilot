import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tokenize } from "../public/js/text.js";

const cases = JSON.parse(readFileSync(new URL("../../tests/fixtures/tokenizer_cases.json", import.meta.url)));

test("tokenisasi identik dengan versi Python", () => {
  for (const c of cases) assert.deepEqual(tokenize(c.text), c.tokens, c.text);
});
