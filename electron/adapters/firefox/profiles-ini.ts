import { readFileSync } from 'node:fs';
import path from 'node:path';

// Tiny INI parser tailored to Mozilla's profiles.ini and installs.ini.
// Mozilla writes the file in a strict subset: section headers in [brackets],
// `key=value` lines, comments starting with `#` or `;`, no nested sections.
// We do not need full INI compatibility (e.g., quoted values, escapes).

export type IniSection = Record<string, string>;
export type IniFile = Record<string, IniSection>;

export function parseIni(text: string): IniFile {
  const result: IniFile = {};
  let current: IniSection | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    if (line.startsWith('[') && line.endsWith(']')) {
      const name = line.slice(1, -1).trim();
      current = {};
      result[name] = current;
      continue;
    }

    if (!current) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    current[key] = value;
  }
  return result;
}

export type ProfileEntry = {
  sectionName: string;
  name: string;
  path: string;
  isRelative: boolean;
  isDefault: boolean;
};

export function listProfiles(profilesIni: IniFile): ProfileEntry[] {
  const profiles: ProfileEntry[] = [];
  for (const [section, body] of Object.entries(profilesIni)) {
    if (!section.startsWith('Profile')) continue;
    const profilePath = body.Path;
    if (!profilePath) continue;
    profiles.push({
      sectionName: section,
      name: body.Name ?? '',
      path: profilePath,
      isRelative: body.IsRelative === '1',
      isDefault: body.Default === '1',
    });
  }
  return profiles;
}

// Firefox 67+ writes installs.ini next to profiles.ini. Each [INSTALL_HASH]
// section names the default profile for that specific Firefox install.
// We don't know the install hash, so we accept the first install entry that
// references an existing profile. With a single Firefox install per machine
// (the common case) there is only one entry, so this is unambiguous.
export function defaultFromInstalls(installsIni: IniFile, profiles: ProfileEntry[]): ProfileEntry | null {
  const profilesByPath = new Map(profiles.map((p) => [p.path, p]));
  for (const [section, body] of Object.entries(installsIni)) {
    if (section === 'General') continue;
    const defaultPath = body.Default;
    if (!defaultPath) continue;
    const found = profilesByPath.get(defaultPath);
    if (found) return found;
  }
  return null;
}

export type ResolvedProfile = {
  profileDir: string;
  source: 'installs.ini' | 'profiles.ini-default' | 'first-profile';
};

export function resolveDefaultProfile(args: {
  profilesIniPath: string;
  installsIniPath: string;
  baseDir: string;
  readFile?: (path: string) => string;
}): ResolvedProfile | null {
  const read = args.readFile ?? ((p: string) => readFileSync(p, 'utf8'));

  let profilesIniText: string;
  try {
    profilesIniText = read(args.profilesIniPath);
  } catch {
    return null;
  }
  const profilesIni = parseIni(profilesIniText);
  const profiles = listProfiles(profilesIni);
  if (profiles.length === 0) return null;

  // 1) installs.ini wins when present.
  let installsIniText: string | null = null;
  try {
    installsIniText = read(args.installsIniPath);
  } catch {
    // optional file
  }
  if (installsIniText) {
    const installs = parseIni(installsIniText);
    const fromInstalls = defaultFromInstalls(installs, profiles);
    if (fromInstalls) {
      return {
        profileDir: resolveProfileDir(args.baseDir, fromInstalls),
        source: 'installs.ini',
      };
    }
  }

  // 2) Default=1 in profiles.ini.
  const flagged = profiles.find((p) => p.isDefault);
  if (flagged) {
    return {
      profileDir: resolveProfileDir(args.baseDir, flagged),
      source: 'profiles.ini-default',
    };
  }

  // 3) Fallback: first profile.
  return {
    profileDir: resolveProfileDir(args.baseDir, profiles[0]),
    source: 'first-profile',
  };
}

function resolveProfileDir(baseDir: string, profile: ProfileEntry): string {
  return profile.isRelative ? path.join(baseDir, profile.path) : profile.path;
}
