// Shared, type-only contracts between the main and renderer processes, grouped by
// domain. (No runtime code lives here so both Vite bundles can import it safely.)
// This barrel keeps the `@/shared/types` import path stable across the codebase.
export * from './structure';
export * from './workspace';
export * from './jigsaw';
export * from './generation';
export * from './app';
export * from './api';
