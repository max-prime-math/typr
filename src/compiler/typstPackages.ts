export interface TypstPackageReference {
  namespace: string;
  name: string;
  version: string;
  key: string;
}

const TYPST_PACKAGE_PATTERN = /@([a-zA-Z][a-zA-Z0-9_-]*)\/([a-zA-Z][a-zA-Z0-9_-]*):([0-9]+\.[0-9]+\.[0-9]+)/g;

export function extractTypstPackageReferences(source: string): TypstPackageReference[] {
  const matches = new Map<string, TypstPackageReference>();
  TYPST_PACKAGE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TYPST_PACKAGE_PATTERN.exec(source)) !== null) {
    const namespace = match[1];
    const name = match[2];
    const version = match[3];
    const key = `${namespace}/${name}:${version}`;

    if (!matches.has(key)) {
      matches.set(key, {
        namespace,
        name,
        version,
        key
      });
    }
  }

  return [...matches.values()];
}

export function formatTypstPackageReference(reference: TypstPackageReference): string {
  return `@${reference.namespace}/${reference.name}:${reference.version}`;
}

export function getTypstPackageUrl(reference: TypstPackageReference): string {
  return `https://packages.typst.org/preview/${reference.name}-${reference.version}.tar.gz`;
}
