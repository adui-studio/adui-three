import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  TestCase,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";

interface OperationTiming {
  title: string;
  category: string;
  durationMs: number;
  failed: boolean;
  source?: { file: string; line: number };
}

interface AttemptTiming {
  file: string;
  title: string;
  worker: number;
  retry: number;
  status: TestResult["status"];
  durationMs: number;
  slowestOperations: OperationTiming[];
}

/** Observes runner timings only; it does not call browser APIs or change test outcomes. */
export default class TimingReporter implements Reporter {
  #root = "";
  #output = "";
  #operations = new WeakMap<TestResult, OperationTiming[]>();
  #attempts: AttemptTiming[] = [];

  onBegin(config: FullConfig): void {
    this.#root = config.rootDir;
    this.#output = config.projects[0]!.outputDir;
  }

  onTestBegin(_test: TestCase, result: TestResult): void {
    this.#operations.set(result, []);
  }

  onStepEnd(_test: TestCase, result: TestResult, step: TestStep): void {
    if (step.category !== "pw:api" && step.category !== "expect") return;
    this.#operations.get(result)?.push({
      title: step.title,
      category: step.category,
      durationMs: step.duration,
      failed: !!step.error,
      source: step.location
        ? {
            file: relative(this.#root, step.location.file).replaceAll("\\", "/"),
            line: step.location.line,
          }
        : undefined,
    });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.#attempts.push({
      file: relative(this.#root, test.location.file).replaceAll("\\", "/"),
      title: test.title,
      worker: result.workerIndex,
      retry: result.retry,
      status: result.status,
      durationMs: result.duration,
      slowestOperations: (this.#operations.get(result) ?? [])
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 10),
    });
    this.#operations.delete(result);
  }

  onEnd(result: FullResult): void {
    mkdirSync(this.#output, { recursive: true });
    writeFileSync(
      join(this.#output, "browser-timings.json"),
      JSON.stringify(
        { status: result.status, durationMs: result.duration, attempts: this.#attempts },
        null,
        2,
      ) + "\n",
    );
  }

  printsToStdio(): boolean {
    return false;
  }
}
