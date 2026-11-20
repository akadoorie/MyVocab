interface ImportMetaEnv {
  /** "1.<commit count>", set at build time (vite.config.ts, D-032). Absent in unit tests. */
  readonly VITE_APP_VERSION?: string;
}
