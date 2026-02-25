import { describe, it, expect } from "vitest";
import {
  CHARACTERS,
  getCharacter,
  getDefaultCharacter,
} from "../character";

describe("character", () => {
  it("should have at least one character defined", () => {
    expect(CHARACTERS.length).toBeGreaterThan(0);
  });

  it("should return a character by id", () => {
    const character = getCharacter("assistant");
    expect(character).toBeDefined();
    expect(character?.id).toBe("assistant");
    expect(character?.name).toBeTruthy();
    expect(character?.systemPrompt).toBeTruthy();
  });

  it("should return undefined for unknown character id", () => {
    const character = getCharacter("unknown-character");
    expect(character).toBeUndefined();
  });

  it("should return the default character", () => {
    const defaultChar = getDefaultCharacter();
    expect(defaultChar).toBeDefined();
    expect(defaultChar.id).toBe("assistant");
  });

  it("each character should have required fields", () => {
    for (const character of CHARACTERS) {
      expect(character.id).toBeTruthy();
      expect(character.name).toBeTruthy();
      expect(character.description).toBeTruthy();
      expect(character.systemPrompt).toBeTruthy();
    }
  });
});
