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
  .record(z.discriminatedUnion('type', [textNodeSchema, listNodeSchema, buttonsNodeSchema, endNodeSchema]))
  .refine((nodes) => Object.keys(nodes).length > 0, 'tree must define at least one node')
  .refine((nodes) => 'start' in nodes, 'tree must define a start node');

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
