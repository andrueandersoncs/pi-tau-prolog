import * as pl from "tau-prolog";
import addPromises from "tau-prolog/modules/promises";
import addLists from "tau-prolog/modules/lists";
import addJs from "tau-prolog/modules/js";
import addOs from "tau-prolog/modules/os";
import addFormat from "tau-prolog/modules/format";
import addRandom from "tau-prolog/modules/random";
import addStatistics from "tau-prolog/modules/statistics";
import addCharsio from "tau-prolog/modules/charsio";
import addConcurrent from "tau-prolog/modules/concurrent";

addPromises(pl);
addLists(pl);
addJs(pl);
addOs(pl);
addFormat(pl);
addRandom(pl);
addStatistics(pl);
addCharsio(pl);
addConcurrent(pl);

import { Context, Effect, Layer, Schema } from "effect";

class ConsultFailedError extends Schema.TaggedError<ConsultFailedError>()(
  "ConsultFailedError",
  {
    cause: Schema.Unknown,
  },
) {}

class QueryFailedError extends Schema.TaggedError<QueryFailedError>()(
  "QueryFailedError",
  {
    cause: Schema.Unknown,
  },
) {}

class NextAnswerFailedError extends Schema.TaggedError<NextAnswerFailedError>()(
  "NextAnswerFailedError",
  {
    cause: Schema.Unknown,
  },
) {}

export class PrologService extends Context.Tag("PrologService")<
  PrologService,
  {
    consult: (program: string) => Effect.Effect<void, ConsultFailedError>;
    query: (goal: string) => Effect.Effect<void, QueryFailedError>;
    answer: () => Effect.Effect<string | false, NextAnswerFailedError>;
  }
>() {}

export const PrologLive = Layer.effect(
  PrologService,
  Effect.gen(function* () {
    const session = pl.create();

    const extractError = (e: unknown): string =>
      e instanceof Error ? e.message : String(e);

    return PrologService.of({
      consult: (program: string) =>
        Effect.tryPromise({
          try: () => session.promiseConsult(program),
          catch: (e) => new ConsultFailedError({ cause: extractError(e) }),
        }),
      query: (goal: string) =>
        Effect.tryPromise({
          try: () => session.promiseQuery(goal),
          catch: (e) => new QueryFailedError({ cause: extractError(e) }),
        }),
      answer: () =>
        Effect.tryPromise({
          try: () => session.promiseAnswer(),
          catch: (e) => new NextAnswerFailedError({ cause: extractError(e) }),
        }).pipe(
          Effect.map((answer) =>
            answer === false ? false : session.format_answer(answer),
          ),
        ),
    });
  }),
);
