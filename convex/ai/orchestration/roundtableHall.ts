export function buildRoundContext(options: {
  userMessage?: string;
  recentMessages: Array<{ author: string; content: string }>;
}): string {
  const block = options.recentMessages
    .slice(-10)
    .map((item) => `${item.author}: ${item.content}`)
    .join('\n');

  return [
    options.userMessage ? `User topic:\n${options.userMessage}` : 'User topic: (continuation round)',
    '',
    'Recent discussion:',
    block || '(no prior discussion)',
  ].join('\n');
}
