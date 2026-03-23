/**
 * TokenBuffer — Smooths out chunky SSE delivery into human-like typing.
 * Receives raw chunks from SSE, drains them token-by-token with a
 * configurable delay so the output feels like natural typing.
 */

export interface TokenBufferOptions {
  /** Ms delay between each emitted token (default 8) */
  tokenDelay?: number;
  /** Callback fired for each token */
  onToken: (token: string) => void;
  /** Callback fired when buffer is fully drained and stream is done */
  onDone?: () => void;
}

export class TokenBuffer {
  private queue: string[] = [];
  private draining = false;
  private streamDone = false;
  private delay: number;
  private onToken: (token: string) => void;
  private onDone?: () => void;

  constructor(opts: TokenBufferOptions) {
    this.delay = opts.tokenDelay ?? 8;
    this.onToken = opts.onToken;
    this.onDone = opts.onDone;
  }

  /** Push a raw chunk from SSE (may contain multiple words/tokens) */
  push(chunk: string) {
    // Split chunk into individual characters for smooth effect,
    // but group word characters together to avoid splitting mid-word
    const tokens = this.tokenize(chunk);
    this.queue.push(...tokens);
    if (!this.draining) this.drain();
  }

  /** Signal that the SSE stream is complete */
  finish() {
    this.streamDone = true;
    // If queue is empty, fire done immediately
    if (this.queue.length === 0 && !this.draining) {
      this.onDone?.();
    }
  }

  /** Flush remaining tokens immediately (e.g., on unmount) */
  flush() {
    while (this.queue.length > 0) {
      this.onToken(this.queue.shift()!);
    }
    this.draining = false;
    if (this.streamDone) this.onDone?.();
  }

  private tokenize(chunk: string): string[] {
    // Split into small groups: each word or punctuation or whitespace
    // This gives smooth but not character-by-character output
    const tokens: string[] = [];
    const regex = /(\S+|\s+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(chunk)) !== null) {
      const word = match[1];
      // For long words, split further for extra smoothness
      if (word.length > 6 && !word.startsWith(' ')) {
        // Split into chunks of ~3 chars
        for (let i = 0; i < word.length; i += 3) {
          tokens.push(word.slice(i, i + 3));
        }
      } else {
        tokens.push(word);
      }
    }
    return tokens;
  }

  private async drain() {
    this.draining = true;
    while (this.queue.length > 0) {
      const token = this.queue.shift()!;
      this.onToken(token);
      // Dynamic delay: faster for whitespace, slower for punctuation
      let d = this.delay;
      if (/^\s+$/.test(token)) d = Math.max(2, d / 2);
      else if (/[.!?]$/.test(token)) d = d * 2.5; // pause on sentence ends
      else if (/[,;:]$/.test(token)) d = d * 1.5; // slight pause on commas
      await sleep(d);
    }
    this.draining = false;
    if (this.streamDone) this.onDone?.();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
