/** Tiny expression language for compiling spec rules into evaluable trees. */

export type Node =
  | { k: "num"; v: number }
  | { k: "ident"; name: string }
  | { k: "call"; name: string; args: Node[] }
  | { k: "offset"; base: Node; n: number }
  | { k: "un"; op: "-" | "not"; arg: Node }
  | { k: "bin"; op: BinOp; l: Node; r: Node };

export type BinOp =
  | "+"
  | "-"
  | "*"
  | "/"
  | ">"
  | "<"
  | ">="
  | "<="
  | "=="
  | "!="
  | "and"
  | "or"
  | "crosses_above"
  | "crosses_below";

export class ParseError extends Error {}

type Token = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

const OPERATORS = [
  ">=",
  "<=",
  "==",
  "!=",
  "&&",
  "||",
  ">",
  "<",
  "=",
  "+",
  "-",
  "*",
  "/",
  "(",
  ")",
  "[",
  "]",
  ",",
];

/**
 * Spec fields are written as prose-ish lists. Normalise them into a single
 * expression: strip bullets and comments, join non-empty lines with AND.
 */
export function normalizeRuleText(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .map((l) => l.replace(/\s*[;.]$/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("#"));
  return lines.join(" and ");
}

function tokenize(input: string): Token[] {
  const src = input
    // clock literals like 09:30 or 16:00:00 become HHMM numbers (930, 1600)
    .replace(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/g, (_m, h: string, m: string) =>
      String(Number(h) * 100 + Number(m)),
    )
    .replace(/\bcrosses?\s+above\b/gi, " crosses_above ")
    .replace(/\bcrosses?\s+below\b/gi, " crosses_below ")
    .replace(/\bcrosses?\s+over\b/gi, " crosses_above ")
    .replace(/\bcrosses?\s+under\b/gi, " crosses_below ")
    .replace(/\bis\s+greater\s+than\s+or\s+equal\s+to\b/gi, " >= ")
    .replace(/\bis\s+less\s+than\s+or\s+equal\s+to\b/gi, " <= ")
    .replace(/\bis\s+greater\s+than\b/gi, " > ")
    .replace(/\bis\s+less\s+than\b/gi, " < ")
    .replace(/\bis\s+above\b/gi, " > ")
    .replace(/\bis\s+below\b/gi, " < ")
    .replace(/\bis\s+equal\s+to\b/gi, " == ")
    .replace(/%/g, " percent ");


  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j] as string)) j++;
      const text = src.slice(i, j).replace(/_/g, "");
      const value = Number(text);
      if (Number.isNaN(value)) throw new ParseError(`Cannot read the number "${text}"`);
      tokens.push({ t: "num", v: value });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j] as string)) j++;
      tokens.push({ t: "id", v: src.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i));
    if (op) {
      tokens.push({ t: "op", v: op === "=" ? "==" : op });
      i += op.length;
      continue;
    }
    throw new ParseError(`Unexpected character "${ch}"`);
  }
  return tokens;
}

const WORD_OPS: Record<string, BinOp> = {
  and: "and",
  or: "or",
  crosses_above: "crosses_above",
  crosses_below: "crosses_below",
};

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private isOp(...values: string[]): boolean {
    const t = this.peek();
    if (!t) return false;
    if (t.t === "op") return values.includes(t.v);
    if (t.t === "id") return values.includes(t.v);
    return false;
  }

  private take(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new ParseError("Expression ended unexpectedly");
    this.pos++;
    return t;
  }

  private expect(op: string): void {
    const t = this.take();
    if (!(t.t === "op" && t.v === op)) throw new ParseError(`Expected "${op}"`);
  }

  parse(): Node {
    const node = this.or();
    if (this.pos < this.tokens.length) {
      const rest = this.tokens[this.pos] as Token;
      throw new ParseError(
        `Could not read the rest of the expression near "${"v" in rest ? rest.v : "?"}"`,
      );
    }
    return node;
  }

  private or(): Node {
    let left = this.and();
    while (this.isOp("or", "||")) {
      this.take();
      left = { k: "bin", op: "or", l: left, r: this.and() };
    }
    return left;
  }

  private and(): Node {
    let left = this.not();
    while (this.isOp("and", "&&")) {
      this.take();
      left = { k: "bin", op: "and", l: left, r: this.not() };
    }
    return left;
  }

  private not(): Node {
    if (this.isOp("not", "!")) {
      this.take();
      return { k: "un", op: "not", arg: this.not() };
    }
    return this.comparison();
  }

  private comparison(): Node {
    let left = this.additive();
    while (this.isOp(">", "<", ">=", "<=", "==", "!=", "crosses_above", "crosses_below")) {
      const t = this.take();
      const op = (t.t === "id" ? WORD_OPS[t.v] : (t.v as BinOp)) as BinOp;
      left = { k: "bin", op, l: left, r: this.additive() };
    }
    return left;
  }

  private additive(): Node {
    let left = this.multiplicative();
    while (this.isOp("+", "-")) {
      const t = this.take();
      left = { k: "bin", op: (t as { v: string }).v as BinOp, l: left, r: this.multiplicative() };
    }
    return left;
  }

  private multiplicative(): Node {
    let left = this.unary();
    while (this.isOp("*", "/")) {
      const t = this.take();
      left = { k: "bin", op: (t as { v: string }).v as BinOp, l: left, r: this.unary() };
    }
    return left;
  }

  private unary(): Node {
    if (this.isOp("-")) {
      this.take();
      return { k: "un", op: "-", arg: this.unary() };
    }
    return this.postfix();
  }

  private postfix(): Node {
    let node = this.primary();
    while (this.isOp("[")) {
      this.take();
      const t = this.take();
      if (t.t !== "num") throw new ParseError("Bar offsets must be a whole number, e.g. close[1]");
      this.expect("]");
      node = { k: "offset", base: node, n: Math.round(t.v) };
    }
    return node;
  }

  private primary(): Node {
    const t = this.take();
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "op" && t.v === "(") {
      const node = this.or();
      this.expect(")");
      return node;
    }
    if (t.t === "id") {
      if (this.isOp("(")) {
        this.take();
        const args: Node[] = [];
        if (!this.isOp(")")) {
          args.push(this.or());
          while (this.isOp(",")) {
            this.take();
            args.push(this.or());
          }
        }
        this.expect(")");
        return { k: "call", name: t.v, args };
      }
      return { k: "ident", name: t.v };
    }
    throw new ParseError(`Unexpected "${"v" in t ? t.v : "?"}"`);
  }
}

export function parseExpression(text: string): Node {
  const normalized = normalizeRuleText(text);
  if (!normalized) throw new ParseError("This field is empty");
  const tokens = tokenize(normalized);
  if (tokens.length === 0) throw new ParseError("This field is empty");
  return new Parser(tokens).parse();
}

export function nodeKey(node: Node): string {
  switch (node.k) {
    case "num":
      return String(node.v);
    case "ident":
      return node.name;
    case "call":
      return `${node.name}(${node.args.map(nodeKey).join(",")})`;
    case "offset":
      return `${nodeKey(node.base)}[${node.n}]`;
    case "un":
      return `(${node.op} ${nodeKey(node.arg)})`;
    case "bin":
      return `(${nodeKey(node.l)} ${node.op} ${nodeKey(node.r)})`;
  }
}

export function collectIdentifiers(node: Node, out = new Set<string>()): Set<string> {
  switch (node.k) {
    case "ident":
      out.add(node.name);
      break;
    case "call":
      out.add(`${node.name}()`);
      node.args.forEach((a) => collectIdentifiers(a, out));
      break;
    case "offset":
      collectIdentifiers(node.base, out);
      break;
    case "un":
      collectIdentifiers(node.arg, out);
      break;
    case "bin":
      collectIdentifiers(node.l, out);
      collectIdentifiers(node.r, out);
      break;
    default:
      break;
  }
  return out;
}
