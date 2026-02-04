export type Option = {
  id: string;
  title: string;
  next: string;
};

export type BaseNode = {
  body: string;
  saveAs?: string;
};

export type ListNode = BaseNode & {
  type: 'list';
  options: Option[];
};

export type ButtonsNode = BaseNode & {
  type: 'buttons';
  options: Option[];
};

export type TextNode = BaseNode & {
  type: 'text';
  next: string;
};

export type EndNode = BaseNode & {
  type: 'end';
};

export type Node = ListNode | ButtonsNode | TextNode | EndNode;

export type TreeDefinition = {
  nodes: Record<string, Node>;
};

export type ResponseAction =
  | { type: 'text'; body: string }
  | { type: 'list'; body: string; options: Array<Pick<Option, 'id' | 'title'>> }
  | { type: 'buttons'; body: string; options: Array<Pick<Option, 'id' | 'title'>> }
  | { type: 'end'; body: string };

export const TREE: TreeDefinition = {
  nodes: {
    start: {
      type: 'list',
      body: '¿Qué te interesa?',
      saveAs: 'service',
      options: [
        { id: 'rent', title: 'Renta', next: 'date' },
        { id: 'dj', title: 'DJ', next: 'date' },
        { id: 'quote', title: 'Cotización', next: 'date' },
      ],
    },
    date: {
      type: 'text',
      body: '¿Para qué fecha lo necesitas?',
      saveAs: 'date',
      next: 'city',
    },
    city: {
      type: 'buttons',
      body: '¿En qué ciudad será el evento?',
      saveAs: 'city',
      options: [
        { id: 'saltillo', title: 'Saltillo', next: 'budget' },
        { id: 'ramos', title: 'Ramos', next: 'budget' },
        { id: 'arteaga', title: 'Arteaga', next: 'budget' },
      ],
    },
    budget: {
      type: 'buttons',
      body: '¿Cuál es tu presupuesto aproximado?',
      saveAs: 'budget',
      options: [
        { id: '$', title: '$', next: 'done' },
        { id: '$$', title: '$$', next: 'done' },
        { id: '$$$', title: '$$$', next: 'done' },
      ],
    },
    done: {
      type: 'end',
      body: 'Gracias. Ya tengo tus datos; en breve te contactamos para darte seguimiento.',
    },
  },
};
