import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';

const requireFromTestFile = createRequire(__filename);

type TestExcludeInstance = {
  globSync: (cwd: string) => string[];
};

type TestExcludeConstructor = new (options: {
  cwd: string;
}) => TestExcludeInstance;

type GlobSyncOptions = {
  cwd: string;
  nodir: boolean;
  dot: boolean;
  posix: boolean;
  ignore?: string[];
};

type GlobModule = {
  globSync: (pattern: string, options: GlobSyncOptions) => string[];
};

const isTestExcludeConstructor = (
  value: unknown,
): value is TestExcludeConstructor => typeof value === 'function';

const isGlobModule = (value: unknown): value is GlobModule =>
  typeof value === 'object' &&
  value !== null &&
  'globSync' in value &&
  typeof value.globSync === 'function';

const FIXTURE_FILES: readonly string[] = [
  'src/index.ts',
  'src/util/helpers.ts',
  'src/util/helpers.test.ts',
  'src/types.d.ts',
  'src/readme.md',
  'lib/app.js',
  'node_modules/left-pad/index.js',
];

type MatchCase = {
  label: string;
  actual: (fixtureDir: string) => string[];
  expected: string[];
};

const MATCH_CASES: readonly MatchCase[] = [
  {
    label: 'test-exclude globSync with default options',
    actual: (fixtureDir) => {
      const loaded: unknown = requireFromTestFile(
        requireFromTestFile.resolve('test-exclude', {
          paths: [requireFromTestFile.resolve('babel-plugin-istanbul')],
        }),
      );
      if (!isTestExcludeConstructor(loaded)) {
        throw new Error('test-exclude export is not a constructor');
      }
      return new loaded({ cwd: fixtureDir }).globSync(fixtureDir);
    },
    expected: ['lib/app.js', 'src/index.ts', 'src/util/helpers.ts'],
  },
  {
    label: 'glob globSync **/*.ts as resolved from test-exclude',
    actual: (fixtureDir) => {
      const testExcludeEntry = requireFromTestFile.resolve('test-exclude', {
        paths: [requireFromTestFile.resolve('babel-plugin-istanbul')],
      });
      const loaded: unknown = requireFromTestFile(
        requireFromTestFile.resolve('glob', { paths: [testExcludeEntry] }),
      );
      if (!isGlobModule(loaded)) {
        throw new Error('glob export has no globSync function');
      }
      return loaded.globSync('**/*.ts', {
        cwd: fixtureDir,
        nodir: true,
        dot: true,
        posix: true,
      });
    },
    expected: [
      'src/index.ts',
      'src/types.d.ts',
      'src/util/helpers.test.ts',
      'src/util/helpers.ts',
    ],
  },
  {
    label: 'glob globSync **/*.{js,ts} ignoring node_modules',
    actual: (fixtureDir) => {
      const testExcludeEntry = requireFromTestFile.resolve('test-exclude', {
        paths: [requireFromTestFile.resolve('babel-plugin-istanbul')],
      });
      const loaded: unknown = requireFromTestFile(
        requireFromTestFile.resolve('glob', { paths: [testExcludeEntry] }),
      );
      if (!isGlobModule(loaded)) {
        throw new Error('glob export has no globSync function');
      }
      return loaded.globSync('**/*.{js,ts}', {
        cwd: fixtureDir,
        nodir: true,
        dot: true,
        posix: true,
        ignore: ['**/node_modules/**'],
      });
    },
    expected: [
      'lib/app.js',
      'src/index.ts',
      'src/types.d.ts',
      'src/util/helpers.test.ts',
      'src/util/helpers.ts',
    ],
  },
];

describe('dependencySecurityOverrides test-exclude glob results', () => {
  let fixtureDir = '';

  beforeAll(() => {
    fixtureDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'test-exclude-glob-fixture-'),
    );
    for (const relativePath of FIXTURE_FILES) {
      const absolutePath = path.join(fixtureDir, relativePath);
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, '');
    }
  });

  afterAll(() => {
    if (fixtureDir !== '') {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  test('test-exclude and glob return the literal expected file list on the fixture', () => {
    const results = MATCH_CASES.map((matchCase) => ({
      label: matchCase.label,
      files: matchCase.actual(fixtureDir).slice().sort(),
    }));
    expect(results).toEqual(
      MATCH_CASES.map((matchCase) => ({
        label: matchCase.label,
        files: matchCase.expected,
      })),
    );
  });
});
