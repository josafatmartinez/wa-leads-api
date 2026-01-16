import { TREE, type Node, type NodeKey, type ResponseAction } from './tree';

type ConversationState = {
  currentNodeKey?: NodeKey;
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
};

export type ProcessInboundOutput = {
  nextNodeKey: NodeKey;
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

export function processInbound({
  conversation,
  inboundMessage,
}: ProcessInboundInput): ProcessInboundOutput {
  const currentNodeKey: NodeKey = conversation.currentNodeKey ?? 'start';
  const currentNode = TREE.nodes[currentNodeKey];

  const updatedAnswers: Record<string, string> = { ...(conversation.answers ?? {}) };
  const answer = parseInboundAnswer(inboundMessage);

  if (currentNode.type === 'end') {
    const node = TREE.nodes.start;
    return {
      nextNodeKey: 'start',
      updatedAnswers,
      responseAction: buildResponseAction(node),
      shouldHandoff: false,
    };
  }

  if (!answer) {
    const node = TREE.nodes.start;
    if (currentNodeKey === 'start') {
      return {
        nextNodeKey: 'start',
        updatedAnswers,
        responseAction: buildResponseAction(node),
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

  if (currentNode.saveAs) updatedAnswers[currentNode.saveAs] = answer;

  let nextNodeKey: NodeKey | undefined;

  if (currentNode.type === 'text') {
    nextNodeKey = currentNode.next;
  } else if (currentNode.type === 'list' || currentNode.type === 'buttons') {
    const opt = matchOption(currentNode, answer);
    if (opt) nextNodeKey = opt.next;
  }

  if (!nextNodeKey) {
    if (currentNodeKey === 'start') {
      const node = TREE.nodes.start;
      return {
        nextNodeKey: 'start',
        updatedAnswers,
        responseAction: buildResponseAction(node),
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

  const nextNode = TREE.nodes[nextNodeKey];
  return {
    nextNodeKey,
    updatedAnswers,
    responseAction: buildResponseAction(nextNode),
    shouldHandoff: nextNode.type === 'end',
  };
}
