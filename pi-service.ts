import { Context, Effect, Schema } from "effect";
import { completeSimple, type Api, type Model } from "@mariozechner/pi-ai";
import type { UnknownException } from "effect/Cause";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

class CompletionError extends Schema.TaggedError<CompletionError>()(
  "CompletionError",
  {
    cause: Schema.Unknown,
  },
) {}

export class PiService extends Context.Tag("PiService")<
  PiService,
  {
    completeSimple: (
      args: Parameters<typeof completeSimple>[1],
    ) => Effect.Effect<
      Awaited<ReturnType<typeof completeSimple>>,
      CompletionError
    >; // complete a simple prompt
    sendMessage: (message: string) => Effect.Effect<void, UnknownException>; // send a message to the user
  }
>() {}

export const makePiServiceLive = <TApi extends Api>(
  model: Model<TApi>,
  apiKey: string,
  pi: ExtensionAPI,
) =>
  PiService.of({
    completeSimple: (args) =>
      Effect.tryPromise(() => completeSimple(model, args, { apiKey })).pipe(
        Effect.mapError((e) => new CompletionError({ cause: e })),
      ),

    sendMessage: (message) =>
      Effect.succeed(
        pi.sendMessage({
          customType: "log",
          content: message,
          display: true,
        }),
      ),
  });
