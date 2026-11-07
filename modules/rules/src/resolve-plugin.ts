import type { JsonValue } from '@boxxy/content-hash';
import type { ParamKindName, Registered, Resolved } from '@boxxy/model';
import type { z } from 'zod';
import { buildRejection } from './build-rejection.ts';
import { formatRulesPath } from './format-rules-path.ts';
import type { Checked } from './types.ts';

export function resolvePlugin<K extends ParamKindName>(
  registered: Registered<K>,
  params: JsonValue,
  key: string,
  path: readonly PropertyKey[],
): Checked<Resolved<K>> {
  return registered.open((plugin): Checked<Resolved<K>> => {
    const checked = plugin.params.safeParse(params);

    if (!checked.success) {
      return {
        value: null,
        rejections: [
          buildRejection(path, {
            kind: 'bad-plugin-params',
            pluginKind: registered.kind,
            name: registered.name,
            message: formatIssues(checked.error.issues),
          }),
        ],
      };
    }

    const parsedParams = checked.data;

    return {
      value: {
        kind: registered.kind,
        name: registered.name,
        key,
        open: (use) => use(plugin, parsedParams),
      },
      rejections: [],
    };
  });
}

function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((issue) =>
      issue.path.length > 0 ? `${formatRulesPath(issue.path)}: ${issue.message}` : issue.message,
    )
    .join('; ');
}
