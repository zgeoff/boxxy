import type { LoadRejection } from '@boxxy/model';
import { formatKeyPath } from '@boxxy/model';
import { match } from 'ts-pattern';
import type { Document } from 'yaml';
import { parseDocument } from 'yaml';
import type { ParsedRulesFile } from './rules-file-schema.ts';
import { rulesFileSchema } from './rules-file-schema.ts';

type RulesFileParse =
  | { readonly kind: 'parsed'; readonly file: ParsedRulesFile }
  | { readonly kind: 'rejected'; readonly rejections: readonly LoadRejection[] };

export function parseRulesFile(fileName: string, bytes: Uint8Array): RulesFileParse {
  return match(toText(bytes))
    .with({ kind: 'refused' }, (refused): RulesFileParse => ({
      kind: 'rejected',
      rejections: [buildInvalid(fileName, '', refused.message)],
    }))
    .with({ kind: 'converted' }, (text) => parseRulesText(fileName, text.value))
    .exhaustive();
}

type Converted<T> =
  | { readonly kind: 'converted'; readonly value: T }
  | { readonly kind: 'refused'; readonly message: string };

function toText(bytes: Uint8Array): Converted<string> {
  // TextDecoder reports bytes that aren't UTF-8 only by throwing, in its fatal mode
  try {
    return { kind: 'converted', value: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { kind: 'refused', message: 'the file is not valid UTF-8' };
  }
}

function buildInvalid(file: string, path: string, message: string): LoadRejection {
  return { file, path, reason: { kind: 'invalid', message } };
}

function parseRulesText(fileName: string, text: string): RulesFileParse {
  const document = parseDocument(text);

  if (document.errors.length > 0) {
    return {
      kind: 'rejected',
      rejections: document.errors.map((error) => buildInvalid(fileName, '', error.message)),
    };
  }

  return match(toPlainValue(document))
    .with({ kind: 'refused' }, (refused): RulesFileParse => ({
      kind: 'rejected',
      rejections: [buildInvalid(fileName, '', refused.message)],
    }))
    .with({ kind: 'converted' }, (plain) => parseRulesValue(fileName, plain.value))
    .exhaustive();
}

function toPlainValue(document: Document): Converted<unknown> {
  // yaml throws, and returns no error, on a document whose aliases expand past its alias limit
  try {
    const value: unknown = document.toJS();

    return { kind: 'converted', value };
  } catch (error) {
    return { kind: 'refused', message: error instanceof Error ? error.message : String(error) };
  }
}

function parseRulesValue(fileName: string, value: unknown): RulesFileParse {
  // zod's record schema drops a `__proto__` key with no issue, so the loader would miss its value
  const protoKeyPaths = collectProtoKeyPaths(value, []);

  if (protoKeyPaths.length > 0) {
    return {
      kind: 'rejected',
      rejections: protoKeyPaths.map((path) =>
        buildInvalid(fileName, formatKeyPath(path), 'the key __proto__ is reserved'),
      ),
    };
  }

  const checked = rulesFileSchema.safeParse(value);

  if (!checked.success) {
    return {
      kind: 'rejected',
      rejections: checked.error.issues.map((issue) =>
        buildInvalid(fileName, formatKeyPath(issue.path), issue.message),
      ),
    };
  }

  return { kind: 'parsed', file: checked.data };
}

function collectProtoKeyPaths(value: unknown, path: readonly PropertyKey[]): PropertyKey[][] {
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown, index) => collectProtoKeyPaths(item, [...path, index]));
  }

  if (typeof value !== 'object' || value === null) {
    return [];
  }

  return Object.entries(value).flatMap(([key, item]: [string, unknown]) =>
    key === '__proto__' ? [[...path, key]] : collectProtoKeyPaths(item, [...path, key]),
  );
}
