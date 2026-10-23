#!/usr/bin/env node
import { Command, Option } from 'commander';
import { driftPass, gen, infer, init, probe, record, watch } from './commands.js';

const program = new Command('typestub')
  .description('Typed tool interfaces for code-mode agents')
  .version('0.1.0')
  .enablePositionalOptions()
  .option('--root <dir>', 'state directory', '.typestub');

const log = (m: string) => process.stderr.write(m + '\n');
const common = () => ({ root: program.opts().root as string, log });
const lang = () => new Option('--lang <lang>', 'stub language').choices(['ts', 'py', 'both']).default('ts');

const upstream = (c: Command) =>
  c
    .argument('[command...]', 'stdio server command (after --)')
    .option('--url <url>', 'Streamable HTTP server URL')
    .option('--cwd <dir>', 'working directory for the server command');

const probeOpts = (c: Command) =>
  c
    .option('--config <file>', 'probe config YAML (default ./probe.yaml if present)')
    .option('--per-tool <n>', 'calls per tool', (v) => parseInt(v, 10))
    .option('--allow-read-only-names', 'also probe tools named get_/list_/search_... without readOnlyHint')
    .option('--no-redact', 'store raw values (do not share these samples)');

upstream(probeOpts(program.command('probe <name>').description('call read-only tools with sample arguments and record responses'))).action(
  async (name: string, command: string[], o) => {
    await probe(name, { ...common(), ...o, command });
  },
);

upstream(program.command('record <name>').description('run as a recording MCP proxy on stdio (passive mode)'))
  .option('--no-redact', 'store raw values')
  .action(async (name: string, command: string[], o) => {
    await record(name, { ...common(), ...o, command, log: () => {} });
  });

program
  .command('infer <name>')
  .description('infer output schemas from recorded samples')
  .option('--no-examples', 'omit example values')
  .action((name: string, o) => void infer(name, { ...common(), ...o }));

program
  .command('gen <name>')
  .description('generate typed stubs from the inferred schema')
  .addOption(lang())
  .option('--out <dir>', 'output directory', 'stubs')
  .option('--untyped', 'inputs only, unknown outputs (baseline)')
  .option('--no-examples', 'omit example values from doc comments')
  .action((name: string, o) => void gen(name, { ...common(), ...o }));

upstream(probeOpts(program.command('init <name>').description('probe + infer + gen in one step')))
  .addOption(lang())
  .option('--out <dir>', 'output directory', 'stubs')
  .option('--no-examples', 'omit example values from doc comments')
  .action(async (name: string, command: string[], o) => {
    await init(name, { ...common(), ...o, command });
  });

program
  .command('watch <name>')
  .description('regenerate stubs on safe drift; report breaking drift')
  .option('--once', 'run a single drift pass and exit')
  .option('--accept-breaking', 'also fold breaking drift into the schema')
  .option('--out <dir>', 'output directory', 'stubs')
  .addOption(lang())
  .action(async (name: string, o) => {
    if (o.once) {
      const r = driftPass(name, { ...common(), ...o });
      log(`safe ${r.safe} · breaking ${r.breaking} · ${r.regenerated ? 'regenerated' : 'unchanged'}`);
      if (r.breaking && !r.regenerated) process.exitCode = 2;
    } else {
      await watch(name, { ...common(), ...o });
    }
  });

program.parseAsync().catch((e: Error) => {
  log(`typestub: ${e.message}`);
  process.exit(1);
});
