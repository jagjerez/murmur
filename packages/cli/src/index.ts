#!/usr/bin/env node
import { run } from './cli';
import { ConfigStore } from './config';

const { stdout, exitCode } = await run(process.argv.slice(2), { config: new ConfigStore() });
if (stdout) {
  console.log(stdout);
}
process.exit(exitCode);
