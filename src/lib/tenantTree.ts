import { z } from 'zod';

const treeOptionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  next: z.string().min(1),
});

const baseNodeSchema = z.object({
  body: z.string().min(1),
  saveAs: z.string().min(1).optional(),
});

const textNodeSchema = baseNodeSchema.extend({
  type: z.literal('text'),
  next: z.string().min(1),
});

const listNodeSchema = baseNodeSchema.extend({
  type: z.literal('list'),
  options: z.array(treeOptionSchema).min(1),
});

const buttonsNodeSchema = baseNodeSchema.extend({
  type: z.literal('buttons'),
  options: z.array(treeOptionSchema).min(1),
});

const endNodeSchema = baseNodeSchema.extend({
  type: z.literal('end'),
});

const tenantTreeNodesSchema = z
  .record(
    z.discriminatedUnion('type', [
      textNodeSchema,
      listNodeSchema,
      buttonsNodeSchema,
      endNodeSchema,
    ]),
  )
  .superRefine((nodes, ctx) => {
    if (Object.keys(nodes).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'tree must define at least one node',
      });
    }

    if (!('start' in nodes)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'tree must define a start node',
      });
    }

    for (const [key, node] of Object.entries(nodes)) {
      if (node.type === 'text') {
        if (!nodes[node.next]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `node "${key}" points to missing next node "${node.next}"`,
            path: [key, 'next'],
          });
        }
        continue;
      }

      if (node.type === 'list' || node.type === 'buttons') {
        for (const [index, option] of node.options.entries()) {
          if (!nodes[option.next]) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `node "${key}" option "${option.id}" points to missing next node "${option.next}"`,
              path: [key, 'options', index, 'next'],
            });
          }
        }
      }
    }
  });

const tenantTreeDefinitionSchema = z.object({
  nodes: tenantTreeNodesSchema,
});

export const tenantTreeSchema = z.object({
  tree: tenantTreeDefinitionSchema,
  name: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
});

export type TenantTreeDefinition = z.infer<typeof tenantTreeDefinitionSchema>;
export type TenantTreeInput = z.infer<typeof tenantTreeSchema>;
