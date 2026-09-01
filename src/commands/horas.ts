import {
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  SlashCommandStringOption,
  SlashCommandUserOption,
  User,
} from 'discord.js';
import { COMMAND_NAMES, EMBED_COLORS } from '../config/constants';
import { buildErrorEmbed } from '../embeds/response.embeds';
import { ExtraHoursError, ExtraHoursRow } from '../services/extraHoursService';
import { formatDateEs, formatHoursShort } from '../services/statsMath';
import { BotCommand, CommandContext } from '../types/command.type';
import { getCurrentWeekRange, getTodayDate, parseBusinessDate } from '../utils/date';
import { formatDurationInput, parseDurationToHours } from '../utils/duration';
import { logger } from '../utils/logger';
import { hasStaffRole } from '../utils/roles';

function tiempoOption(option: SlashCommandStringOption) {
  return option
    .setName('tiempo')
    .setDescription('Duración: 2h, 2h 30m o 2h 30m 22s')
    .setRequired(true)
    .setMaxLength(40);
}

function fechaOption(option: SlashCommandStringOption) {
  return option
    .setName('fecha')
    .setDescription('Día: hoy, 31/08, 31/08/2026 o 2026-08-31')
    .setRequired(false)
    .setMaxLength(20);
}

function motivoOption(option: SlashCommandStringOption) {
  return option
    .setName('motivo')
    .setDescription('Por qué se agregan o cambian (opcional)')
    .setRequired(false)
    .setMaxLength(200);
}

function usuarioOption(option: SlashCommandUserOption) {
  return option
    .setName('usuario')
    .setDescription('Practicante (solo encargado / admin)')
    .setRequired(false);
}

const data = new SlashCommandBuilder()
  .setName(COMMAND_NAMES.HORAS)
  .setDescription('Horas extra de un día, sin cambiar puntual / tardanza / falta')
  .addSubcommand((sub) =>
    sub
      .setName('add')
      .setDescription('Sumar extra a un día (completa horas faltantes)')
      .addStringOption(tiempoOption)
      .addStringOption(fechaOption)
      .addStringOption(motivoOption)
      .addUserOption(usuarioOption),
  )
  .addSubcommand((sub) =>
    sub
      .setName('actualizar')
      .setDescription('Reemplazar el extra de un día')
      .addStringOption(tiempoOption)
      .addStringOption(fechaOption)
      .addStringOption(motivoOption)
      .addUserOption(usuarioOption),
  )
  .addSubcommand((sub) =>
    sub
      .setName('quitar')
      .setDescription('Quitar el extra de un día (la asistencia no cambia)')
      .addStringOption(fechaOption)
      .addUserOption(usuarioOption),
  )
  .addSubcommand((sub) =>
    sub
      .setName('ver')
      .setDescription('Ver extras de un día o de esta semana')
      .addStringOption(fechaOption)
      .addUserOption(usuarioOption),
  );

async function resolveTarget(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<
  | { ok: true; user: User; practicante: { id: number; fechaInicio: string | null; fechaFin: string | null } }
  | { ok: false }
> {
  const targetUser = interaction.options.getUser('usuario') ?? interaction.user;
  if (
    targetUser.id !== interaction.user.id &&
    !hasStaffRole(interaction, context.adminRoleId)
  ) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          'Solo tu encargado o RR.HH. pueden gestionar horas extra de otro practicante.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return { ok: false };
  }

  const practicante = await context.statsService.findPracticanteByDiscord(
    targetUser.id,
  );
  if (!practicante) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          targetUser.id === interaction.user.id
            ? 'No estás registrado como practicante.'
            : 'Ese usuario no está registrado como practicante.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return { ok: false };
  }

  return { ok: true, user: targetUser, practicante };
}

async function resolveFecha(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
  practicante: { fechaInicio: string | null; fechaFin: string | null },
): Promise<string | null> {
  const today = getTodayDate(context.timezone);
  const fecha = parseBusinessDate(
    interaction.options.getString('fecha'),
    today,
  );
  if (!fecha) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          'Fecha no válida. Usa `hoy`, `31/08`, `31/08/2026` o `2026-08-31`.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  if (fecha > today) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed('No se pueden cargar horas extra en una fecha futura.'),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  const minDate = practicante.fechaInicio ?? '2026-08-17';
  if (fecha < minDate) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          `Esa fecha es anterior al inicio de prácticas (${formatDateEs(minDate)}).`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  if (practicante.fechaFin && fecha > practicante.fechaFin) {
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          `Esa fecha es posterior al fin de prácticas (${formatDateEs(practicante.fechaFin)}).`,
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  return fecha;
}

async function parseTiempoOrReply(
  interaction: ChatInputCommandInteraction,
): Promise<number | null> {
  const horas = parseDurationToHours(
    interaction.options.getString('tiempo', true),
  );
  if (horas != null) return horas;
  await interaction.reply({
    embeds: [
      buildErrorEmbed(
        'No entendí el tiempo. Ejemplos: `2h`, `2h 30m`, `2h 30m 22s` (máximo 12 h).',
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
  return null;
}

function extraLine(extra: ExtraHoursRow): string {
  const motivo = extra.motivo ? ` — ${extra.motivo}` : '';
  return `${formatDurationInput(extra.horas)} (${formatHoursShort(extra.horas)} h)${motivo}`;
}

async function weekField(
  context: CommandContext,
  discordId: string,
) {
  const week = await context.attendanceService.getWeeklySummary(discordId);
  return {
    name: 'Esta semana',
    value: `${formatHoursShort(week.horasAcumuladas)} / ${formatHoursShort(week.meta)} h`,
    inline: true,
  };
}

async function execute(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
): Promise<void> {
  if (!context.extraHoursService) {
    await interaction.reply({
      embeds: [buildErrorEmbed('Las horas extra no están disponibles ahora.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const target = await resolveTarget(interaction, context);
  if (!target.ok) return;

  const subcommand = interaction.options.getSubcommand();
  try {
    if (subcommand === 'ver') {
      await handleVer(interaction, context, target.user, target.practicante);
      return;
    }

    const fecha = await resolveFecha(interaction, context, target.practicante);
    if (!fecha) return;

    if (subcommand === 'quitar') {
      const removed = await context.extraHoursService.remove(
        target.practicante.id,
        fecha,
      );
      context.statsService.invalidatePracticante(target.practicante.id);
      if (!removed) {
        await interaction.reply({
          embeds: [
            buildErrorEmbed(
              `No hay horas extra el ${formatDateEs(fecha)}. La asistencia de ese día no cambia.`,
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(EMBED_COLORS.WARNING)
            .setTitle('Horas extra eliminadas')
            .setDescription(
              `Se quitó **${extraLine(removed)}** del ${formatDateEs(fecha)}. El estado de ese día (puntual, tardanza o falta) se mantiene.`,
            )
            .addFields(await weekField(context, target.user.id)),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const horas = await parseTiempoOrReply(interaction);
    if (horas == null) return;
    const motivo = interaction.options.getString('motivo');
    const previous = await context.extraHoursService.findByDate(
      target.practicante.id,
      fecha,
    );

    const saved =
      subcommand === 'actualizar'
        ? await context.extraHoursService.set({
            practicanteId: target.practicante.id,
            fecha,
            horas,
            motivo: motivo ?? undefined,
            creadoPorDiscord: interaction.user.id,
          })
        : await context.extraHoursService.add({
            practicanteId: target.practicante.id,
            fecha,
            horas,
            motivo,
            creadoPorDiscord: interaction.user.id,
          });

    context.statsService.invalidatePracticante(target.practicante.id);
    const whose =
      target.user.id === interaction.user.id
        ? 'ese día'
        : `el día de ${target.user.username}`;
    const action =
      subcommand === 'actualizar'
        ? `El extra de ${whose} quedó en`
        : previous
          ? `Se sumaron ${formatDurationInput(horas)} al extra de ${whose}. Ahora tiene`
          : `Se agregó extra a ${whose}:`;

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(EMBED_COLORS.SUCCESS)
          .setTitle(
            subcommand === 'actualizar'
              ? 'Horas extra actualizadas'
              : 'Horas extra registradas',
          )
          .setDescription(
            `${action} **${extraLine(saved)}**. El estado de asistencia no cambia; en **Ver detalle** sale como Extra.`,
          )
          .addFields(
            { name: 'Fecha', value: formatDateEs(fecha), inline: true },
            await weekField(context, target.user.id),
          ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    if (error instanceof ExtraHoursError) {
      await interaction.reply({
        embeds: [buildErrorEmbed(error.message)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    logger.error(`Error en /horas ${subcommand}:`, error);
    await interaction.reply({
      embeds: [
        buildErrorEmbed(
          'No pude guardar las horas extra. Intenta de nuevo en unos minutos.',
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleVer(
  interaction: ChatInputCommandInteraction,
  context: CommandContext,
  targetUser: User,
  practicante: { id: number; fechaInicio: string | null; fechaFin: string | null },
): Promise<void> {
  const rawFecha = interaction.options.getString('fecha');
  const extras = rawFecha
    ? await (async () => {
        const fecha = await resolveFecha(interaction, context, practicante);
        if (!fecha) return null;
        const row = await context.extraHoursService!.findByDate(
          practicante.id,
          fecha,
        );
        return { fecha, rows: row ? [row] : [] };
      })()
    : {
        fecha: null as string | null,
        rows: await context.extraHoursService!.listBetween(
          practicante.id,
          getCurrentWeekRange(context.timezone).startDate,
          getCurrentWeekRange(context.timezone).endDate,
        ),
      };

  if (extras == null) return;

  const title = extras.fecha
    ? `Extras del ${formatDateEs(extras.fecha)}`
    : 'Extras de esta semana';
  const lines =
    extras.rows.length === 0
      ? ['_Sin horas extra en este rango._']
      : extras.rows.map(
          (row) =>
            `• ${formatDateEs(row.fecha)}  ⚡ Extra  ·  ${extraLine(row)}`,
        );

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(EMBED_COLORS.INFO)
        .setTitle(title)
        .setDescription(
          `${lines.join('\n')}\n\nEl extra es adicional: puntual, tardanza o falta se mantienen.`,
        )
        .addFields(await weekField(context, targetUser.id)),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

export const horasCommand: BotCommand = {
  data,
  execute,
};
