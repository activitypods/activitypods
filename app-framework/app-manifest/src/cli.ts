#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { DEFAULT_REPOSITORY, fetchCatalog, isShapeTree, localized, shortName, type CatalogShape } from './catalog.ts';
import { generateDocuments, serialize } from './generate.ts';
import {
  addNeed,
  isSpecialRight,
  MANIFEST_FILE,
  needKey,
  readManifest,
  removeNeed,
  SPECIAL_RIGHTS,
  writeManifest,
  type AccessNeed,
  type AppManifest,
  type Necessity,
  type SpecialRight
} from './manifest.ts';

const PACKAGE = '@activitypods/app-manifest';

const USAGE = `Usage: app-manifest <command>

  init                 Create ${MANIFEST_FILE} and install this package
  add [search]         Add an access need or a special right
                         --read, --write     Read only, or read and write
                         --required, --optional
                         --repository <url>  Shape repository (default: ${DEFAULT_REPOSITORY})
  remove [search]      Remove an access need or a special right
  list                 List the declared access needs
  check                Validate the manifest and check that the shape trees exist
  build                Generate the documents without Vite
                         --origin <url>      URL of the app (required)
                         --out <dir>         Output directory (default: dist)
`;

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    read: { type: 'boolean' },
    write: { type: 'boolean' },
    required: { type: 'boolean' },
    optional: { type: 'boolean' },
    repository: { type: 'string', default: process.env.SHAPE_REPOSITORY_URL || DEFAULT_REPOSITORY },
    origin: { type: 'string' },
    out: { type: 'string', default: 'dist' },
    help: { type: 'boolean', short: 'h' }
  }
});

const locale = (process.env.LC_ALL || process.env.LANG || 'en').slice(0, 2);

const rightLabel = (right: SpecialRight) => localized(SPECIAL_RIGHTS[right], locale);

const ask = async (question: string) => {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await prompt.question(question)).trim();
  } finally {
    prompt.close();
  }
};

const choose = async <T>(question: string, options: { label: string; value: T }[]): Promise<T> => {
  if (!process.stdin.isTTY) throw new Error(`${question} Use the command-line options, or run it in a terminal.`);
  console.log(question);
  options.forEach(({ label }, index) => console.log(`  ${String(index + 1).padStart(2)}. ${label}`));
  for (;;) {
    const option = options[Number(await ask('> ')) - 1];
    if (option) return option.value;
  }
};

const contains = (text: string | undefined, search: string) => text?.toLowerCase().includes(search.toLowerCase());

type Candidate = { type: 'shape'; uri: string } | { type: 'right'; right: SpecialRight };

const shapeOption = (shape: CatalogShape) => {
  const usage = shape.usage ? ` - ${shape.usage} app(s)` : '';
  return {
    label: `${localized(shape.label, locale)} (${shortName(shape.uri)})${usage}\n      ${localized(shape.definition, locale)}`,
    value: { type: 'shape', uri: shape.uri } as Candidate
  };
};

const rightOption = (right: SpecialRight) => ({
  label: `${rightLabel(right)} (${right})`,
  value: { type: 'right', right } as Candidate
});

const findCandidate = async (search: string | undefined): Promise<Candidate> => {
  if (search && search in SPECIAL_RIGHTS) return { type: 'right', right: search as SpecialRight };

  if (search && URL.canParse(search)) {
    if (!(await isShapeTree(search))) throw new Error(`${search} is not a shape tree`);
    return { type: 'shape', uri: search };
  }

  const catalog = await fetchCatalog(flags.repository!);
  const exact = catalog.find(shape => shortName(shape.uri) === search);
  if (exact) return { type: 'shape', uri: exact.uri };

  const shapes = catalog.filter(
    shape =>
      !search ||
      contains(shortName(shape.uri), search) ||
      Object.values(shape.label ?? {}).some(label => contains(label, search)) ||
      Object.values(shape.definition ?? {}).some(definition => contains(definition, search))
  );
  const rights = (Object.keys(SPECIAL_RIGHTS) as SpecialRight[]).filter(
    right => !search || contains(right, search) || Object.values(SPECIAL_RIGHTS[right]).some(l => contains(l, search))
  );

  const options = [...shapes.map(shapeOption), ...rights.map(rightOption)];
  if (!options.length) {
    throw new Error(
      `Nothing found for "${search}". Pass the URI of a shape tree, or propose a new shape on ${flags.repository}`
    );
  }
  return options.length === 1 ? options[0].value : choose('Which one?', options);
};

const add = async (search?: string) => {
  const manifest = await readManifest();
  const candidate = await findCandidate(search);

  const necessity: Necessity =
    flags.optional || flags.required
      ? flags.optional
        ? 'optional'
        : 'required'
      : process.stdin.isTTY
        ? await choose<Necessity>('Is it required?', [
            { label: 'Required', value: 'required' },
            { label: 'Optional', value: 'optional' }
          ])
        : 'required';

  let need: AccessNeed;
  if (candidate.type === 'right') {
    need = candidate.right;
  } else {
    const write =
      flags.write || flags.read
        ? !!flags.write
        : process.stdin.isTTY
          ? await choose('Which access?', [
              { label: 'Read', value: false },
              { label: 'Read and write', value: true }
            ])
          : false;
    need = { shapeTreeUri: candidate.uri, accessMode: write ? ['acl:Read', 'acl:Write'] : 'acl:Read' };
  }

  await writeManifest(addNeed(manifest, need, necessity));
  console.log(`Added ${describe(need)} (${necessity})`);
};

const describe = (need: AccessNeed) =>
  isSpecialRight(need)
    ? `${need}: ${rightLabel(need)}`
    : `${shortName(need.shapeTreeUri)}: ${[need.accessMode].flat().join(', ')}`;

const allNeeds = (manifest: AppManifest) =>
  (['required', 'optional'] as Necessity[]).flatMap(necessity =>
    (manifest.accessNeeds[necessity] ?? []).map(need => ({ need, necessity }))
  );

const remove = async (search?: string) => {
  const manifest = await readManifest();
  const matches = allNeeds(manifest).filter(
    ({ need }) => !search || needKey(need) === search || contains(describe(need), search)
  );
  if (!matches.length) throw new Error(search ? `No access need matches "${search}"` : 'No access need declared');

  const options = matches.map(({ need, necessity }) => ({ label: `${describe(need)} (${necessity})`, value: need }));
  const need = options.length === 1 ? options[0].value : await choose('Which one?', options);

  await writeManifest(removeNeed(manifest, needKey(need)));
  console.log(`Removed ${describe(need)}`);
};

const list = async () => {
  for (const { need, necessity } of allNeeds(await readManifest())) {
    console.log(`${necessity.padEnd(9)} ${describe(need)}`);
  }
};

const check = async () => {
  const manifest = await readManifest();
  let valid = true;
  for (const { need } of allNeeds(manifest)) {
    if (!isSpecialRight(need) && !(await isShapeTree(need.shapeTreeUri))) {
      console.error(`${need.shapeTreeUri} is not a reachable shape tree`);
      valid = false;
    }
  }
  if (!valid) process.exit(1);
  console.log(`${MANIFEST_FILE} is valid`);
};

const build = async () => {
  if (!flags.origin) throw new Error('--origin is required');
  const baseUrl = flags.origin.endsWith('/') ? flags.origin : `${flags.origin}/`;
  const documents = generateDocuments(await readManifest(), baseUrl);
  for (const [path, document] of Object.entries(documents)) {
    const file = join(flags.out!, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, serialize(document));
  }
  console.log(`Generated ${Object.keys(documents).length} documents in ${flags.out}`);
};

const install = () => {
  if (!existsSync('package.json')) {
    console.warn(`No package.json found. Install ${PACKAGE} as a dev dependency to use the "app-manifest" command.`);
    return;
  }
  const { dependencies, devDependencies } = JSON.parse(readFileSync('package.json', 'utf8'));
  if (dependencies?.[PACKAGE] || devDependencies?.[PACKAGE]) return;

  const [command, ...args] = existsSync('yarn.lock')
    ? ['yarn', 'add', '--dev']
    : existsSync('pnpm-lock.yaml')
      ? ['pnpm', 'add', '--save-dev']
      : ['npm', 'install', '--save-dev'];
  const { status } = spawnSync(command, [...args, PACKAGE], { stdio: 'inherit' });
  if (status !== 0) console.warn(`Could not install ${PACKAGE}. Please add it as a dev dependency.`);
};

const init = async () => {
  if (existsSync(MANIFEST_FILE)) throw new Error(`${MANIFEST_FILE} already exists`);
  const name = await ask('Name of the app: ');
  const description = await ask('Description: ');
  await writeManifest({
    $schema: `./node_modules/${PACKAGE}/schema.json`,
    name,
    description,
    accessNeeds: { required: [], optional: [] }
  });
  install();
  console.log(`Created ${MANIFEST_FILE}

Add the plugin to vite.config.ts:

  import { appManifest } from '${PACKAGE}/vite';
  plugins: [appManifest()]

Then use the generated client ID in your auth provider:

  import { clientId } from 'virtual:app-manifest';

To declare access needs, run: npx app-manifest add`);
};

const commands: Record<string, (search?: string) => Promise<void>> = { init, add, remove, list, check, build };

const [command, search] = positionals;

if (flags.help || !command || !commands[command]) {
  console.log(USAGE);
  process.exit(flags.help ? 0 : 1);
}

try {
  await commands[command](search);
} catch (e: any) {
  console.error(e.message);
  process.exit(1);
}
