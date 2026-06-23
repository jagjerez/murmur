#!/usr/bin/env node
import { run } from './cli';

console.log(run(process.argv.slice(2)));
