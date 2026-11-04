#!/usr/bin/env node
import { main } from './src/cli.mjs';
import { ConsultError } from './src/config.mjs';

main(process.argv.slice(2)).catch((e) => {
  console.error(e instanceof ConsultError ? `Error: ${e.message}` : e);
  process.exit(1);
});
