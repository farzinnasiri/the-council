import type { MemberVoiceName } from '../types/domain';

export const DEFAULT_MEMBER_VOICE: MemberVoiceName = 'Puck';

export const MEMBER_VOICE_OPTIONS: Array<{
  value: MemberVoiceName;
  label: string;
  family: 'female' | 'male';
  description: string;
}> = [
  { value: 'Kore', label: 'Kore', family: 'female', description: 'Calm, steady, and composed.' },
  { value: 'Zephyr', label: 'Zephyr', family: 'female', description: 'Soft, gentle, and light.' },
  { value: 'Fenrir', label: 'Fenrir', family: 'male', description: 'Deep, weighty, and authoritative.' },
  { value: 'Puck', label: 'Puck', family: 'male', description: 'Clear, upbeat, and conversational.' },
  { value: 'Charon', label: 'Charon', family: 'male', description: 'Resonant, measured, and informative.' },
];

export function describeMemberVoice(voiceName: MemberVoiceName): string {
  return MEMBER_VOICE_OPTIONS.find((option) => option.value === voiceName)?.description ?? '';
}
