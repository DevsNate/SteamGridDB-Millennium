// Millennium: Keep upstream environment checks production-only in Starlight.
export const process: { env: { ROLLUP_ENV: string } } = {
  env: { ROLLUP_ENV: 'production' },
};
