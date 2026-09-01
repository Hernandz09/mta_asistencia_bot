import { EmbedBuilder, User } from 'discord.js';
import { EMBED_COLORS } from '../config/constants';
import { WeeklySchedule } from '../services/scheduleService';
import { formatHoursShort } from '../services/statsMath';

export function buildHorarioEmbed(
  user: User,
  displayName: string,
  schedule: WeeklySchedule,
  todayWeekday: number,
): EmbedBuilder {
  const lines = schedule.days.map((day) => {
    const todayMark = day.dia === todayWeekday ? '  ← hoy' : '';
    if (!day.start || !day.end) {
      return `**${day.label}** · descanso${todayMark}`;
    }
    return `**${day.label}** · ${day.start} – ${day.end} · ${formatHoursShort(day.hours)} h${todayMark}`;
  });

  return new EmbedBuilder()
    .setColor(EMBED_COLORS.INFO)
    .setTitle(`Horario · ${displayName}`)
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .setDescription(
      [`@${user.username}`, '', ...lines].join('\n'),
    )
    .setFooter({
      text: `Total semanal: ${formatHoursShort(schedule.totalHours)} h`,
    });
}
