import { TREE, type Node, type ResponseAction, type TreeDefinition } from './tree';

type ConversationState = {
  currentNodeKey?: string;
  answers?: Record<string, string>;
};

type InboundTextMessage = {
  type: 'text';
  text: { body: string };
};

type InboundInteractiveMessage = {
  type: 'interactive';
  interactive: {
    button_reply?: { id: string };
    list_reply?: { id: string };
  };
};

export type InboundMessage =
  | InboundTextMessage
  | InboundInteractiveMessage
  | { type: string; [key: string]: unknown };

export type ProcessInboundInput = {
  conversation: ConversationState;
  inboundMessage: InboundMessage;
  tree?: TreeDefinition;
};

export type ProcessInboundOutput = {
  nextNodeKey: string;
  updatedAnswers: Record<string, string>;
  responseAction: ResponseAction;
  shouldHandoff: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isTextMessage(msg: InboundMessage): msg is InboundTextMessage {
  if (msg.type !== 'text') return false;
  if (!isRecord((msg as any).text)) return false;
  return typeof (msg as InboundTextMessage).text.body === 'string';
}

function isInteractiveMessage(msg: InboundMessage): msg is InboundInteractiveMessage {
  if (msg.type !== 'interactive') return false;
  if (!isRecord((msg as any).interactive)) return false;
  return true;
}

function buildResponseAction(node: Node): ResponseAction {
  if (node.type === 'text') return { type: 'text', body: node.body };
  if (node.type === 'list')
    return {
      type: 'list',
      body: node.body,
      options: node.options.map(({ id, title }) => ({ id, title })),
    };
  if (node.type === 'buttons')
    return {
      type: 'buttons',
      body: node.body,
      options: node.options.map(({ id, title }) => ({ id, title })),
    };
  return { type: 'end', body: node.body };
}

function parseInboundAnswer(msg: InboundMessage): string | undefined {
  if (isTextMessage(msg)) return msg.text.body.trim();
  if (isInteractiveMessage(msg)) {
    const buttonId = msg.interactive.button_reply?.id;
    if (typeof buttonId === 'string') return buttonId;
    const listId = msg.interactive.list_reply?.id;
    if (typeof listId === 'string') return listId;
  }
  return undefined;
}

function matchOption(node: Node, answer: string) {
  if (node.type !== 'list' && node.type !== 'buttons') return undefined;
  const normalized = answer.trim().toLowerCase();
  return node.options.find(
    (opt) => opt.id.toLowerCase() === normalized || opt.title.toLowerCase() === normalized,
  );
}

function resolveNodeKey(nodes: Record<string, Node>, candidate?: string): string {
  if (candidate && nodes[candidate]) return candidate;
  if (nodes.start) return 'start';
  const first = Object.keys(nodes)[0];
  return first ?? 'start';
}

export function processInbound({
  conversation,
  inboundMessage,
  tree,
}: ProcessInboundInput): ProcessInboundOutput {
  const nodes = tree?.nodes ?? TREE.nodes;
  const fallbackKey = resolveNodeKey(nodes, 'start');
  const currentNodeKey = resolveNodeKey(nodes, conversation.currentNodeKey ?? fallbackKey);
  const currentNode = nodes[currentNodeKey] ?? nodes[fallbackKey];

  const updatedAnswers: Record<string, string> = { ...(conversation.answers ?? {}) };
  const answer = parseInboundAnswer(inboundMessage);

  const startNode = nodes[fallbackKey] ?? nodes[currentNodeKey];

  if (currentNode?.type === 'end') {
    return {
      nextNodeKey: fallbackKey,
      updatedAnswers,
      responseAction: buildResponseAction(startNode),
      shouldHandoff: false,
    };
  }

  if (!answer) {
    if (currentNodeKey === fallbackKey) {
      return {
        nextNodeKey: fallbackKey,
        updatedAnswers,
        responseAction: buildResponseAction(startNode),
        shouldHandoff: false,
      };
    }

    return {
      nextNodeKey: currentNodeKey,
      updatedAnswers,
      responseAction: buildResponseAction(currentNode),
      shouldHandoff: false,
    };
  }

  if (currentNode?.saveAs) updatedAnswers[currentNode.saveAs] = answer;

  let nextNodeKey: string | undefined;

  if (currentNode?.type === 'text') {
    nextNodeKey = currentNode.next;
  } else if (currentNode?.type === 'list' || currentNode?.type === 'buttons') {
    const opt = matchOption(currentNode, answer);
    if (opt) nextNodeKey = opt.next;
  }

  if (!nextNodeKey) {
    if (currentNodeKey === fallbackKey) {
      return {
        nextNodeKey: fallbackKey,
        updatedAnswers,
        responseAction: buildResponseAction(startNode),
        shouldHandoff: false,
      };
    }

    return {
      nextNodeKey: currentNodeKey,
      updatedAnswers,
      responseAction: buildResponseAction(currentNode),
      shouldHandoff: false,
    };
  }

  const nextNode = nodes[nextNodeKey] ?? startNode;
  return {
    nextNodeKey,
    updatedAnswers,
    responseAction: buildResponseAction(nextNode),
    shouldHandoff: nextNode.type === 'end',
  };
}
