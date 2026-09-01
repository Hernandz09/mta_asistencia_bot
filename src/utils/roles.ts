import { ChatInputCommandInteraction, GuildMember } from 'discord.js';

export function hasStaffRole(
  interaction: ChatInputCommandInteraction | { member: unknown },
  adminRoleId?: string,
): boolean {
  if (!adminRoleId) {
    return false;
  }

  const member = interaction.member;
  if (!member) {
    return false;
  }

  if (Array.isArray((member as { roles?: unknown }).roles)) {
    return ((member as { roles: string[] }).roles).includes(adminRoleId);
  }

  if (member instanceof GuildMember) {
    return member.roles.cache.has(adminRoleId);
  }

  const roles = (member as { roles?: { cache?: { has: (id: string) => boolean } } })
    .roles;
  return Boolean(roles?.cache?.has(adminRoleId));
}
