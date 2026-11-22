// @myvocab/core: pure domain logic with zero runtime dependencies (PRD §10.3, §10.4).
export * from './lang/languages';

export * from './text/normalize';
export * from './text/script';

export * from './item/types';
export * from './item/limits';
export * from './item/identity';
export * from './item/validate';

export * from './card/types';
export * from './card/strategies';
export * from './card/build-card';

export * from './practice/random';
export * from './practice/round-order';
export * from './practice/reducer';

export * from './setup/defaults';

export * from './csv/rfc4180';
export * from './csv/columns';
export * from './csv/parse-rows';
export * from './csv/merge-planner';
export * from './csv/serialize-items';
