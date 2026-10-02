import {
  type CreateEnv,
  createEnv,
  type DefaultCombinedSchema,
  type StandardSchemaDictionary,
  type StandardSchemaV1,
} from "@t3-oss/env-core";

/** No client or shared schemas: t3's own default for an empty dictionary. */
type NoSchemas = NonNullable<unknown>;

/** Where variables are read from: `process.env` by default, or a plain object in tests. */
export type RuntimeEnv = Record<string, string | undefined>;

/** One missing or invalid variable. Holds the schema's message, never the value. */
export interface EnvIssue {
  readonly variable: string;
  readonly message: string;
}

/** Thrown by {@link defineEnv} when one or more variables are missing or invalid. */
export class EnvError extends Error {
  readonly issues: readonly EnvIssue[];

  constructor(issues: readonly EnvIssue[]) {
    const lines = issues.map((issue) => `  ${issue.variable}: ${issue.message}`);
    super(`Invalid environment variables:\n${lines.join("\n")}`);
    this.name = "EnvError";
    this.issues = issues;
  }
}

/** Options for {@link defineEnv}. */
export interface DefineEnvOptions<
  TServer extends StandardSchemaDictionary,
  TExtends extends Array<Record<string, unknown>>,
> {
  /** One schema per variable this workspace reads. */
  server: TServer;
  /** Envs already built with `defineEnv`, such as `sharedEnv`; merged into the result. */
  extends?: TExtends;
  /** Defaults to `process.env`. Never mutated. */
  runtimeEnv?: RuntimeEnv;
}

/**
 * Validates `runtimeEnv` against `server` and returns the typed values, merged
 * with every env in `extends`. Empty strings count as unset, so defaults apply.
 *
 * @throws {EnvError} listing every missing or invalid variable, unless
 * `SKIP_ENV_VALIDATION` is `1` or `true`, in which case the raw values are
 * returned unchecked.
 */
export function defineEnv<
  TServer extends StandardSchemaDictionary,
  const TExtends extends Array<Record<string, unknown>> = [],
>(
  options: DefineEnvOptions<TServer, TExtends>,
): CreateEnv<DefaultCombinedSchema<TServer, NoSchemas, NoSchemas>, TExtends> {
  // t3 deletes empty strings from the object it is given; copy so process.env survives.
  const runtimeEnv = { ...(options.runtimeEnv ?? process.env) };
  const skip = runtimeEnv.SKIP_ENV_VALIDATION;

  return createEnv<undefined, TServer, NoSchemas, NoSchemas, TExtends>({
    server: options.server,
    extends: options.extends,
    runtimeEnv,
    isServer: true,
    emptyStringAsUndefined: true,
    skipValidation: skip === "1" || skip === "true",
    onValidationError: (issues) => {
      throw new EnvError(issues.map(toEnvIssue));
    },
  });
}

function toEnvIssue(issue: StandardSchemaV1.Issue): EnvIssue {
  const [first] = issue.path ?? [];
  const key = typeof first === "object" ? first.key : first;
  return { variable: String(key ?? "(root)"), message: issue.message };
}
