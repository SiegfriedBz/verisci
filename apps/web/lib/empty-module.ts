// Stands in for the optional `@x402/*` payment packages that Coinbase's SDK, reached through
// wagmi's connectors, imports lazily but this app never calls (next.config.ts). Turbopack
// checks named imports, so the names the build reaches are declared, as nothing.
export const x402Client = undefined;
export const registerExactEvmScheme = undefined;
export const ExactEvmScheme = undefined;
export const UptoEvmScheme = undefined;
export const ExactSvmScheme = undefined;
export const toClientEvmSigner = undefined;
