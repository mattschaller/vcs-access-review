import { Command } from 'commander';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { GitHubProvider } from './providers/github.js';
import { format as formatMarkdown } from './formatters/markdown.js';
import { format as formatCsv } from './formatters/csv.js';
import { format as formatJson } from './formatters/json.js';

const formatters = {
  md: formatMarkdown,
  csv: formatCsv,
  json: formatJson,
} as const;

type FormatKey = keyof typeof formatters;

const extMap: Record<FormatKey, string> = {
  md: 'md',
  csv: 'csv',
  json: 'json',
};

export function createCli(): Command {
  const program = new Command();

  program
    .name('vcs-access-review')
    .description('Generate auditor-ready access review reports from VCS providers')
    .version('0.1.0');

  program
    .command('run')
    .description('Generate an access review report')
    .requiredOption('--org <org>', 'GitHub org name')
    .option('--provider <provider>', 'VCS provider', 'github')
    .option('--token <token>', 'GitHub PAT (or set GITHUB_TOKEN env var)')
    .option('--format <fmt>', 'Output format: md, csv, json', 'md')
    .option('--since <days>', 'Inactivity threshold in days', '90')
    .option('--output <dir>', 'Output directory', '.')
    .action(async (opts) => {
      const token = opts.token || process.env.GITHUB_TOKEN;
      if (!token) {
        console.error('Error: --token or GITHUB_TOKEN env var is required');
        process.exit(1);
      }

      const fmt = opts.format as FormatKey;
      if (!(fmt in formatters)) {
        console.error(`Error: unsupported format "${fmt}". Use md, csv, or json.`);
        process.exit(1);
      }

      const since = parseInt(opts.since, 10);
      if (isNaN(since) || since <= 0) {
        console.error('Error: --since must be a positive number');
        process.exit(1);
      }

      if (opts.provider !== 'github') {
        console.error(`Error: unsupported provider "${opts.provider}". Only "github" is supported in v0.1.`);
        process.exit(1);
      }

      const provider = new GitHubProvider(since);
      console.log(`Fetching members for org "${opts.org}"...`);

      const members = await provider.getMembers(opts.org, token);
      console.log(`Found ${members.length} members.`);

      const output = formatters[fmt](members, opts.org);

      const date = new Date().toISOString().slice(0, 10);
      const filename = `access-review-${opts.org}-${date}.${extMap[fmt]}`;
      const outDir = resolve(opts.output);
      mkdirSync(outDir, { recursive: true });
      const outPath = resolve(outDir, filename);

      writeFileSync(outPath, output, 'utf-8');
      console.log(`Report written to ${outPath}`);
    });

  return program;
}
