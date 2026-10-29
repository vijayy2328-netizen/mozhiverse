import { describe, expect, it } from "vitest";
import { LANGUAGES, QUICK_PHRASES, isEmergency, toneHint } from "./index.js";

describe("shared communication options", () => {
  it("maps all six supported languages to browser speech locale tags", () => {
    expect(Object.keys(LANGUAGES)).toHaveLength(6);
    expect(LANGUAGES.Tamil).toBe("ta-IN");
    expect(LANGUAGES.English).toBe("en-US");
    expect(LANGUAGES.Hindi).toBe("hi-IN");
    expect(LANGUAGES.Telugu).toBe("te-IN");
    expect(LANGUAGES.Malayalam).toBe("ml-IN");
    expect(LANGUAGES.Kannada).toBe("kn-IN");
  });

  it("provides ten accessible quick phrases", () => {
    expect(QUICK_PHRASES).toHaveLength(10);
  });

  it("detects emergency phrases in English and Indic languages", () => {
    expect(isEmergency("Please help me right now")).toBe(true);
    expect(isEmergency("மருத்துவர் உதவி தேவை")).toBe(true);
    expect(isEmergency("Good morning")).toBe(false);
  });

  it("produces cautious, text-based tone hints with explanations", () => {
    const hint = toneHint("Thank you so much!");
    expect(hint).not.toBeNull();
    expect(hint?.tone).toBe("appreciative");
    expect(hint?.reason).toContain("appreciation");

    const frustrated = toneHint("Why is this not working!! I am annoyed");
    expect(frustrated?.tone).toBe("frustrated");

    const neutral = toneHint("The meeting starts at two");
    expect(neutral).toBeNull();
  });
});
