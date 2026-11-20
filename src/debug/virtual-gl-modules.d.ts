// The module vite.config.ts makes: a lazy import of every source file that holds GLSL (scripts/gl-scan.mjs).
declare module 'virtual:gl-modules' {
  export const GL_MODULES: Record<string, () => Promise<Record<string, unknown>>>;
}
