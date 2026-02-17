import { Type } from "@sinclair/typebox";

export const prologTools = [
  {
    name: "consult",
    description:
      "Load Prolog rules and facts into the knowledge base. Replaces existing clauses for any redefined predicates. Use for defining rules and static facts. Use assertz/1 via the query tool to accumulate dynamic facts.",
    parameters: Type.Object({
      program: Type.String({
        description: "Prolog program text (facts and rules)",
      }),
    }),
  },
  {
    name: "query",
    description:
      "Prove a Prolog goal. Use **answer** to get solutions via backtracking.",
    parameters: Type.Object({
      goal: Type.String({
        description:
          "Prolog goal to prove, e.g. 'findall(X, user_said(X, _), Inputs).'",
      }),
    }),
  },
  {
    name: "answer",
    description:
      "Get the next solution for the current query via backtracking. Returns false when no more solutions exist.",
    parameters: Type.Object({}),
  },
  {
    name: "respond",
    description:
      "Respond to the user's input. Use this when you have produced the required output.",
    parameters: Type.Object({
      response: Type.String({
        description: "The response to the user's input",
      }),
    }),
  },
];
