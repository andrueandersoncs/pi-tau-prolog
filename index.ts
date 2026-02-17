import {
  type ExtensionContext,
  type ExtensionAPI,
  type InputEvent,
} from "@mariozechner/pi-coding-agent";
import { Context, DateTime, Effect, Either, pipe, Queue, Schema } from "effect";
import { getModel, type Message } from "@mariozechner/pi-ai";
import { prologTools } from "./prolog-tools";
import { generateSystemPrompt } from "./system-prompt";
import { makePiServiceLive, PiService } from "./pi-service";
import { PrologService, PrologLive } from "./prolog-service";
import { appendFileSync } from "node:fs";

class InputQueue extends Context.Tag("InputQueue")<
  InputQueue,
  Queue.Queue<InputEvent>
>() {}

class ApiKeyError extends Schema.TaggedError<ApiKeyError>()("ApiKeyError", {
  cause: Schema.Unknown,
}) {}

class UnknownToolError extends Schema.TaggedError<UnknownToolError>()(
  "UnknownToolError",
  {
    cause: Schema.Unknown,
  },
) {}

const appendLog = (message: string) =>
  Effect.sync(() => appendFileSync("./rlm.log", message + "\n"));

// Naming is abstraction, therefore assigning data to a variable is a form of abstraction by naming
// What if, instead of assigning a single "name" to a datum, we allowed assigning multiple names thus allowing multiple abstractions?
// - the idea being that the same datum can have different meanings in different contexts and from different perspectives.

// REPL is a tight loop, code runs and prints its result automatically
// - fast feedback = fast course correction = built-in verification
// Hypothesis: eval => print is effective because it generates and adds [script, result] to the context
// - which is essentially a form of realtime learning
// Hypothesis: a REPL with a logic language would be far more effective

// REPL allows access to arbitrary computation via the programming language
// - arbitrary computation means any problem can be solved, thus generality

export default function rlmExtension(pi: ExtensionAPI) {
  Effect.runPromise(
    Effect.gen(function* () {
      yield* appendLog("Starting RLM extension");

      const inputQueue = yield* Queue.unbounded<InputEvent>();

      yield* appendLog("Initialized input queue");

      const startContext = yield* Effect.async<ExtensionContext>((resume) => {
        pi.on("session_start", async (_event, ctx) => {
          return resume(Effect.succeed(ctx));
        });
      });

      yield* appendLog("Got start context");

      const model = getModel("anthropic", "claude-opus-4-6");
      const apiKey = yield* Effect.tryPromise(() =>
        startContext.modelRegistry.getApiKey(startContext.model!),
      ).pipe(Effect.mapError((e) => new ApiKeyError({ cause: e })));

      yield* appendLog("Got API key");

      const PiServiceLive = makePiServiceLive(model, apiKey!, pi);

      yield* appendLog("Initialized Pi service");

      // listen for input events and add them to the input queue
      yield* Effect.fork(
        Effect.forever(
          pipe(
            Effect.async<InputEvent>((resume) =>
              pi.on("input", async (event, _ctx) =>
                resume(Effect.succeed(event)),
              ),
            ),
            Effect.tap(() => appendLog("Got input event")),
            Effect.tap(
              Effect.fn(function* (inputEvent) {
                const inputQueue = yield* InputQueue;
                yield* inputQueue.offer(inputEvent);
              }),
            ),
            Effect.provideService(InputQueue, inputQueue),
          ),
        ),
      );

      yield* appendLog("Started input event listener");

      // listen for input events from the queue and add them to the pl session
      yield* Effect.forever(
        Effect.gen(function* () {
          yield* appendLog("Starting RLM loop");

          const piService = yield* PiService;
          const inputQueue = yield* InputQueue;
          const prologService = yield* PrologService;
          const inputEvent = yield* Queue.take(inputQueue);

          yield* appendLog("Got input");

          const currentTimeUtc = yield* DateTime.now;
          const timestamp = currentTimeUtc.epochMillis;
          const escapedInputText = inputEvent.text
            .replace(/\\/g, "\\\\")
            .replace(/'/g, "\\'");
          const userSaidAssertion = `assertz(user_said('${escapedInputText}', ${timestamp})).`;

          yield* prologService.query(userSaidAssertion);

          yield* appendLog("Executed user said assertion");

          const messages: Message[] = [
            {
              role: "user",
              content: inputEvent.text,
              timestamp: timestamp,
            },
          ];

          let hasResponse = false;
          while (!hasResponse) {
            const completion = yield* piService.completeSimple({
              systemPrompt: generateSystemPrompt(inputEvent.text, ""),
              messages,
              tools: prologTools,
            });

            // pro tip: you have to add the assistant's response to the messages array..
            messages.push(completion);

            yield* appendLog(
              "Got completion: " +
                JSON.stringify({
                  content: completion.content,
                  stopReason: completion.stopReason,
                  errorMessage: completion.errorMessage,
                }),
            );

            const toolCalls = completion.content.filter(
              (c) => c.type === "toolCall",
            );

            for (const toolCall of toolCalls) {
              switch (toolCall.name) {
                case "consult": {
                  yield* appendLog(
                    "Consulting: " + toolCall.arguments["program"],
                  );

                  const result = yield* prologService.consult(toolCall.arguments["program"]).pipe(Effect.either);
                  
                  if (Either.isLeft(result)) {
                    messages.push({
                      role: "toolResult",
                      toolCallId: toolCall.id,
                      toolName: toolCall.name,
                      content: [
                        { type: "text", text: "Consult failed: " + result.left.cause },
                      ],
                      isError: true,
                      timestamp,
                    });
                  } else {
                    messages.push({
                      role: "toolResult",
                      toolCallId: toolCall.id,
                      toolName: toolCall.name,
                      content: [{ type: "text", text: "Consulted successfully - remember to use the query tool to prove goals and/or use the answer tool to get the next solution via backtracking" }],
                      isError: false,
                      timestamp,
                    });
                  }

                  break;
                }
                case "query": {
                  yield* appendLog("Querying: " + toolCall.arguments["goal"]);
                  const result = yield* prologService.query(toolCall.arguments["goal"]).pipe(Effect.either);
                  
                  if (Either.isLeft(result)) {
                    messages.push({
                      role: "toolResult",
                      toolCallId: toolCall.id,
                      toolName: toolCall.name,
                      content: [
                        { type: "text", text: "Query failed: " + result.left.cause },
                      ],
                      isError: true,
                      timestamp,
                    });
                  } else {
                    messages.push({
                      role: "toolResult",
                      toolCallId: toolCall.id,
                      toolName: toolCall.name,
                      content: [
                        { type: "text", text: "Query executed successfully - remember to use the answer tool to get the next solution via backtracking" },
                      ],
                      isError: false,
                      timestamp,
                    });
                  }
                  
                  break;
                }
                case "answer": {
                  const result = yield* prologService.answer().pipe(Effect.either);

                  if (Either.isLeft(result)) {
                    yield* appendLog("Answer failed: " + result.left.cause);
                    messages.push({
                      role: "toolResult",
                      toolCallId: toolCall.id,
                      toolName: toolCall.name,
                      content: [
                        { type: "text", text: "Answer failed: " + result.left.cause },
                      ],
                      isError: true,
                      timestamp,
                    });
                  } else {
                    yield* appendLog("Taking answer: " + result.right);
                    messages.push({
                      role: "toolResult",
                      toolCallId: toolCall.id,
                      toolName: toolCall.name,
                      content: [
                        { type: "text", text: result.right || "No answer found" },
                      ],
                      isError: false,
                      timestamp,
                    });
                  }
                  
                  break;
                }
                case "respond": {
                  yield* appendLog(
                    "Responding: " + toolCall.arguments["response"],
                  );
                  yield* piService.sendMessage(toolCall.arguments["response"]);
                  messages.push({
                    role: "toolResult",
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                    content: [{ type: "text", text: "Responded successfully" }],
                    isError: false,
                    timestamp,
                  });
                  hasResponse = true;
                  break;
                }
                default: {
                  return yield* new UnknownToolError({ cause: toolCall.name });
                }
              }
            }

            yield* appendLog("Processed tool calls");
          }

          yield* appendLog("Has response");
        }).pipe(
          Effect.provideService(PiService, PiServiceLive),
          Effect.provideService(InputQueue, inputQueue),
          Effect.provide(PrologLive),
          Effect.catchAll((e) => appendLog(e.message)),
        ),
      );

      yield* appendLog("Started RLM loop");
    }),
  );
}
