import * as fs from 'fs';
import * as path from 'path';

const MINIMUM_HANDLEBARS_VERSION = '4.7.10';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getStringProperty = (
  record: Record<string, unknown>,
  propertyName: string,
): string => {
  const value = record[propertyName];
  if (typeof value !== 'string') {
    throw new Error(`Expected property "${propertyName}" to be a string`);
  }
  return value;
};

const parseVersionComponents = (version: string): [number, number, number] => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (match === null) {
    throw new Error(`Unable to parse semver-like version from "${version}"`);
  }
  const [, majorText, minorText, patchText] = match;
  return [Number(majorText), Number(minorText), Number(patchText)];
};

const isVersionAtLeastMinimum = (
  version: string,
  minimumVersion: string,
): boolean => {
  const [major, minor, patch] = parseVersionComponents(version);
  const [minMajor, minMinor, minPatch] = parseVersionComponents(minimumVersion);
  if (major !== minMajor) {
    return major > minMajor;
  }
  if (minor !== minMinor) {
    return minor > minMinor;
  }
  return patch >= minPatch;
};

const stripRangeOperatorPrefix = (range: string): string =>
  range.replace(/^[\^~>=<\s]+/, '');

type HandlebarsLockEntry = {
  key: string;
  version: string;
};

const getHandlebarsLockEntries = (
  packageLockJson: unknown,
): HandlebarsLockEntry[] => {
  if (!isRecord(packageLockJson)) {
    throw new Error('package-lock.json root is not a JSON object');
  }
  const packagesValue = packageLockJson.packages;
  if (!isRecord(packagesValue)) {
    throw new Error('package-lock.json has no "packages" object');
  }
  return Object.keys(packagesValue)
    .filter(
      (key) =>
        key === 'node_modules/handlebars' ||
        key.endsWith('/node_modules/handlebars'),
    )
    .map((key) => {
      const entryValue = packagesValue[key];
      if (!isRecord(entryValue)) {
        throw new Error(`handlebars lockfile entry "${key}" is not an object`);
      }
      return { key, version: getStringProperty(entryValue, 'version') };
    });
};

const getHandlebarsOverrideRange = (packageJson: unknown): string => {
  if (!isRecord(packageJson)) {
    throw new Error('package.json root is not a JSON object');
  }
  const overridesValue = packageJson.overrides;
  if (!isRecord(overridesValue)) {
    throw new Error('package.json has no "overrides" object');
  }
  return getStringProperty(overridesValue, 'handlebars');
};

const MINIMUM_UNDICI_VERSION_FOR_MAJOR_6_OR_LOWER = '6.29.1';
const MINIMUM_UNDICI_VERSION_FOR_MAJOR_7 = '7.30.1';

type UndiciLockEntry = {
  key: string;
  version: string;
};

const getUndiciLockEntries = (packageLockJson: unknown): UndiciLockEntry[] => {
  if (!isRecord(packageLockJson)) {
    throw new Error('package-lock.json root is not a JSON object');
  }
  const packagesValue = packageLockJson.packages;
  if (!isRecord(packagesValue)) {
    throw new Error('package-lock.json has no "packages" object');
  }
  return Object.keys(packagesValue)
    .filter(
      (key) =>
        key === 'node_modules/undici' || key.endsWith('/node_modules/undici'),
    )
    .map((key) => {
      const entryValue = packagesValue[key];
      if (!isRecord(entryValue)) {
        throw new Error(`undici lockfile entry "${key}" is not an object`);
      }
      return { key, version: getStringProperty(entryValue, 'version') };
    });
};

const isUndiciVersionPatched = (version: string): boolean => {
  const [major] = parseVersionComponents(version);
  if (major >= 8) {
    return true;
  }
  if (major === 7) {
    return isVersionAtLeastMinimum(version, MINIMUM_UNDICI_VERSION_FOR_MAJOR_7);
  }
  return isVersionAtLeastMinimum(
    version,
    MINIMUM_UNDICI_VERSION_FOR_MAJOR_6_OR_LOWER,
  );
};

describe('dependencySecurityOverrides handlebars GHSA-8r5x-fm3f-whwj GHSA-p8wg-vrv2-v86f', () => {
  const packageLockJson: unknown = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'),
  );
  const packageJson: unknown = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'),
  );

  const handlebarsLockEntries = getHandlebarsLockEntries(packageLockJson);

  test('package-lock.json contains at least one resolved handlebars entry', () => {
    expect(handlebarsLockEntries.length).toBeGreaterThan(0);
  });

  it.each(handlebarsLockEntries)(
    'resolved handlebars entry at $key is >= 4.7.10',
    ({ version }) => {
      expect(isVersionAtLeastMinimum(version, MINIMUM_HANDLEBARS_VERSION)).toBe(
        true,
      );
    },
  );

  test('package.json pins handlebars to >= 4.7.10 via npm overrides', () => {
    const overrideRange = getHandlebarsOverrideRange(packageJson);
    const overrideVersion = stripRangeOperatorPrefix(overrideRange);
    expect(
      isVersionAtLeastMinimum(overrideVersion, MINIMUM_HANDLEBARS_VERSION),
    ).toBe(true);
  });
});

describe('dependencySecurityOverrides undici GHSA-2m5v-pch6-74hx GHSA-qrxm-fqhp-jwvm GHSA-4w7w-5xrc-9h26 GHSA-xjj6-f33q-929c', () => {
  const packageLockJson: unknown = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'),
  );

  const undiciLockEntries = getUndiciLockEntries(packageLockJson);

  test('package-lock.json contains at least one undici entry', () => {
    expect(undiciLockEntries.length).toBeGreaterThan(0);
  });

  it.each(undiciLockEntries)(
    'resolved undici entry at $key ($version) is patched for high advisories',
    ({ version }) => {
      expect(isUndiciVersionPatched(version)).toBe(true);
    },
  );
});

const MINIMUM_BRACE_EXPANSION_VERSION_BY_MAJOR: Record<number, string> = {
  1: '1.1.20',
  2: '2.1.6',
  5: '5.0.11',
};

type BraceExpansionLockEntry = {
  key: string;
  version: string;
};

const getBraceExpansionLockEntries = (
  packageLockJson: unknown,
): BraceExpansionLockEntry[] => {
  if (!isRecord(packageLockJson)) {
    throw new Error('package-lock.json root is not a JSON object');
  }
  const packagesValue = packageLockJson.packages;
  if (!isRecord(packagesValue)) {
    throw new Error('package-lock.json has no "packages" object');
  }
  return Object.keys(packagesValue)
    .filter(
      (key) =>
        key === 'node_modules/brace-expansion' ||
        key.endsWith('/node_modules/brace-expansion'),
    )
    .map((key) => {
      const entryValue = packagesValue[key];
      if (!isRecord(entryValue)) {
        throw new Error(
          `brace-expansion lockfile entry "${key}" is not an object`,
        );
      }
      return { key, version: getStringProperty(entryValue, 'version') };
    });
};

const isBraceExpansionVersionPatched = (version: string): boolean => {
  const [major] = parseVersionComponents(version);
  const minimumVersion = MINIMUM_BRACE_EXPANSION_VERSION_BY_MAJOR[major];
  if (minimumVersion === undefined) {
    throw new Error(
      `No minimum brace-expansion version is defined for major ${major} ("${version}")`,
    );
  }
  return isVersionAtLeastMinimum(version, minimumVersion);
};

describe('dependencySecurityOverrides brace-expansion GHSA-6j4f-fj2g-mc7p GHSA-qhr7-859c-m2p7', () => {
  const packageLockJson: unknown = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'),
  );

  const braceExpansionLockEntries =
    getBraceExpansionLockEntries(packageLockJson);

  test('package-lock.json contains at least one brace-expansion entry', () => {
    expect(braceExpansionLockEntries.length).toBeGreaterThan(0);
  });

  it.each(braceExpansionLockEntries)(
    'resolved brace-expansion entry at $key ($version) is patched for high advisories',
    ({ version }) => {
      expect(isBraceExpansionVersionPatched(version)).toBe(true);
    },
  );
});
