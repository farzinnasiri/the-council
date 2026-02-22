export function resolveAdvisoryResponders(options: {
  activeMemberIds: string[];
  mentionedMemberIds?: string[];
}): string[] {
  const active = new Set(options.activeMemberIds);
  const mentioned = Array.from(new Set((options.mentionedMemberIds ?? []).filter((id) => active.has(id))));

  if (mentioned.length > 0) {
    return mentioned;
  }

  return options.activeMemberIds;
}
