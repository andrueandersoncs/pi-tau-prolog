import { PrologLive, PrologService } from "./prolog-service";
import { Effect, Either } from "effect";

const runTest = (
  name: string,
  test: Effect.Effect<void, unknown, PrologService>,
) =>
  Effect.gen(function* () {
    console.log(`\n=== ${name} ===`);
    const result = yield* test.pipe(Effect.either);
    if (Either.isLeft(result)) {
      const err = result.left;
      console.log("FAILED:", err);
    }
  });

const tests = Effect.gen(function* () {
  const prologService = yield* PrologService;

  // Test 1: Working query
  yield* runTest(
    "Test 1: Basic plus/3",
    Effect.gen(function* () {
      yield* prologService.consult(`
            plus(z, Y, Y).
            plus(s(X), Y, s(Z)) :- plus(X, Y, Z).
        `);
      yield* prologService.query("plus(X, Y, s(s(s(z)))).");
      const answer = yield* prologService.answer();
      console.log("Answer:", answer);
    }),
  );

  // Test 2: Non-existent predicate — should show readable error now
  yield* runTest(
    "Test 2: non-existent predicate error message",
    Effect.gen(function* () {
      yield* prologService.query("bogus_predicate(X).");
      const answer = yield* prologService.answer();
      console.log("Answer:", answer);
    }),
  );

  // Test 3: The exact query from the log that failed
  yield* runTest(
    "Test 3: include with lambda (from rlm.log line 16)",
    Effect.gen(function* () {
      yield* prologService.consult(
        ":- use_module(library(os)).\n:- use_module(library(lists)).",
      );
      yield* prologService.query(
        "working_directory(CWD, CWD), directory_files(CWD, Files), include([F]>>(atom_concat(CWD, F, Full), exists_directory(Full), F \\= '.', F \\= '..'), Files, Dirs), length(Dirs, Count).",
      );
      const answer = yield* prologService.answer();
      console.log("Answer:", answer);
    }),
  );

  // Test 4: os + lists modules working end-to-end (the approach that succeeded in log)
  yield* runTest(
    "Test 4: directory listing with findall (working approach)",
    Effect.gen(function* () {
      yield* prologService.consult(`
            :- use_module(library(os)).
            :- use_module(library(lists)).
            check_dir(Base, Name) :-
                Name \\= '.',
                Name \\= '..',
                atom_concat(Base, '/', P1),
                atom_concat(P1, Name, Full),
                exists_directory(Full).
        `);
      yield* prologService.query(
        "working_directory(CWD, CWD), directory_files(CWD, Files), findall(D, (member(D, Files), check_dir(CWD, D)), Dirs), length(Dirs, Count).",
      );
      const answer = yield* prologService.answer();
      console.log("Answer:", answer);
    }),
  );

  // Test 5: false termination still works
  yield* runTest(
    "Test 5: answer returns false correctly",
    Effect.gen(function* () {
      yield* prologService.query("member(X, [a]).");
      const a1 = yield* prologService.answer();
      console.log("Answer 1:", a1);
      const a2 = yield* prologService.answer();
      console.log("Answer 2 (should be false):", a2);
    }),
  );
});

Effect.runPromise(tests.pipe(Effect.provide(PrologLive))).catch((e) => {
  console.error("Top-level error:", e);
});
