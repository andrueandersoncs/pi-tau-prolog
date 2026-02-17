# pi-tau-prolog

An extension for [pi-coding-agent](https://github.com/nicoschmidt/pi-coding-agent) that gives an LLM a Prolog reasoning layer. The agent uses [Tau Prolog](http://tau-prolog.org/) as persistent working memory -- asserting facts, defining rules, and querying solutions via backtracking -- before responding to the user.

## How It Works

The extension runs an event loop that:

1. Receives user input and asserts it as a Prolog fact (`user_said/2`)
2. Sends the input to Claude (Opus) along with a system prompt describing the available Prolog tools
3. The model iterates through a tool-use cycle -- consulting programs, querying goals, retrieving answers -- until it produces a response
4. The Prolog knowledge base persists across turns, accumulating facts and rules as context

### Tools

| Tool | Purpose |
|------|---------|
| `consult` | Load rules and facts into the knowledge base |
| `query` | Prove a Prolog goal |
| `answer` | Get the next solution via backtracking |
| `respond` | Send a response to the user |

### Tau Prolog Modules

The extension loads: `lists`, `js`, `os`, `format`, `random`, `statistics`, `charsio`, and `concurrent`.

## Stack

- **Runtime**: [Bun](https://bun.sh)
- **Language**: TypeScript
- **Effect system**: [Effect](https://effect.website)
- **Prolog engine**: [Tau Prolog](http://tau-prolog.org/)
- **LLM**: Claude via `@mariozechner/pi-ai`
- **Host**: `@mariozechner/pi-coding-agent`

## Project Structure

```
index.ts            Main extension entry point and event loop
prolog-service.ts   Effect service wrapping Tau Prolog session
prolog-tools.ts     Tool definitions for LLM tool use
pi-service.ts       Effect service wrapping pi-ai completions
system-prompt.ts    System prompt with Prolog reference
test-tp.ts          Tau Prolog test script
```

## Setup

```sh
bun install
```

## Scripts

```sh
bun run check   # Type-check without emitting
bun test         # Run tests
```
