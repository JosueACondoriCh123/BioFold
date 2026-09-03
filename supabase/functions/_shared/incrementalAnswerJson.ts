/**
 * Incrementally decodes only the root `answer` JSON string.
 * The complete document is retained for strict validation at the end.
 */
export class IncrementalAnswerJsonDecoder {
  private readonly chunks: string[] = [];
  private depth = 0;
  private inString = false;
  private stringRole: "key" | "answer" | "other" = "other";
  private decodedToken = "";
  private currentRootKey: string | undefined;
  private lastSignificant = "";
  private escaping = false;
  private unicodeEscape: string | null = null;
  private pendingHighSurrogate: number | null = null;
  private streamedAnswer = "";

  push(fragment: string): string {
    this.chunks.push(fragment);
    let emitted = "";

    const appendDecoded = (value: string) => {
      this.decodedToken += value;
      if (this.stringRole === "answer") {
        this.streamedAnswer += value;
        emitted += value;
      }
    };
    const appendCodeUnit = (code: number) => {
      if (this.pendingHighSurrogate !== null) {
        if (code >= 0xdc00 && code <= 0xdfff) {
          const point = 0x10000 + ((this.pendingHighSurrogate - 0xd800) << 10) + (code - 0xdc00);
          this.pendingHighSurrogate = null;
          appendDecoded(String.fromCodePoint(point));
          return;
        }
        appendDecoded(String.fromCharCode(this.pendingHighSurrogate));
        this.pendingHighSurrogate = null;
      }
      if (code >= 0xd800 && code <= 0xdbff) this.pendingHighSurrogate = code;
      else appendDecoded(String.fromCharCode(code));
    };
    const flushPendingSurrogate = () => {
      if (this.pendingHighSurrogate === null) return;
      appendDecoded(String.fromCharCode(this.pendingHighSurrogate));
      this.pendingHighSurrogate = null;
    };

    for (let index = 0; index < fragment.length; index += 1) {
      const character = fragment[index]!;
      if (this.inString) {
        if (this.unicodeEscape !== null) {
          if (!/[0-9a-f]/i.test(character)) throw new Error("Structured JSON contains an invalid Unicode escape.");
          this.unicodeEscape += character;
          if (this.unicodeEscape.length === 4) {
            appendCodeUnit(Number.parseInt(this.unicodeEscape, 16));
            this.unicodeEscape = null;
            this.escaping = false;
          }
          continue;
        }
        if (this.escaping) {
          if (character === "u") {
            this.unicodeEscape = "";
            continue;
          }
          const escaped: Record<string, string> = {
            '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t",
          };
          if (!(character in escaped)) throw new Error("Structured JSON contains an invalid escape.");
          flushPendingSurrogate();
          appendDecoded(escaped[character]!);
          this.escaping = false;
          continue;
        }
        if (character === "\\") {
          this.escaping = true;
          continue;
        }
        if (character === '"') {
          flushPendingSurrogate();
          this.inString = false;
          if (this.stringRole === "key") this.currentRootKey = this.decodedToken;
          this.lastSignificant = '"';
          continue;
        }
        if (character.charCodeAt(0) < 0x20) throw new Error("Structured JSON contains an unescaped control character.");
        flushPendingSurrogate();
        appendDecoded(character);
        continue;
      }

      if (character === '"') {
        this.inString = true;
        this.decodedToken = "";
        if (this.depth === 1 && (this.lastSignificant === "{" || this.lastSignificant === ",")) this.stringRole = "key";
        else if (this.depth === 1 && this.lastSignificant === ":" && this.currentRootKey === "answer") this.stringRole = "answer";
        else this.stringRole = "other";
        continue;
      }
      if (character === "{" || character === "[") this.depth += 1;
      else if (character === "}" || character === "]") this.depth -= 1;
      if (this.depth < 0) throw new Error("Structured JSON closed more containers than it opened.");
      if (!/\s/.test(character)) this.lastSignificant = character;
    }
    return emitted;
  }

  finish(): { raw: string; value: unknown; streamedAnswer: string } {
    if (this.inString || this.escaping || this.unicodeEscape !== null || this.depth !== 0) {
      throw new Error("OpenRouter ended before the structured JSON document was complete.");
    }
    const raw = this.chunks.join("");
    let value: unknown;
    try { value = JSON.parse(raw); }
    catch { throw new Error("OpenRouter returned malformed structured content."); }
    return { raw, value, streamedAnswer: this.streamedAnswer };
  }
}
