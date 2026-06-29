import { test, expect } from "vitest";
import { FrontmatterWidget } from "./frontmatterPanel.js";

// Regression: WidgetType (the CodeMirror base class) defines a read-only
// `get editable()`. A field named `editable` compiles to `this.editable = …`,
// which throws "Attempted to assign to readonly property" in strict mode — every
// note with frontmatter black-screened the app. Constructing the widget must not
// throw, and CM's `editable` getter must stay intact (so CM still treats the
// block as non-editable); our own flag lives on `allowEdit`.
test("constructing FrontmatterWidget does not assign over WidgetType.editable", () => {
  expect(() => new FrontmatterWidget([], true)).not.toThrow();

  const w = new FrontmatterWidget([{ key: "name", value: "Hello" }], true);
  expect(w.allowEdit).toBe(true);
  // Inherited CM getter — unshadowed, still false for our block widget.
  expect(w.editable).toBe(false);

  const ro = new FrontmatterWidget([], false);
  expect(ro.allowEdit).toBe(false);
  expect(ro.editable).toBe(false);
});
