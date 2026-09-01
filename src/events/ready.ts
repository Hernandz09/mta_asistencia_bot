import {
  Client,
  ComponentType,
  Events,
  Message,
  TextChannel,
} from 'discord.js';
import { BUSINESS_RULES } from '../config/business';
import { BUTTON_CUSTOM_IDS } from '../config/constants';
import { AppConfig } from '../config/env';
import { buildAttendanceButtonRow } from '../components/attendanceButtons';
import { buildAttendancePanelEmbed } from '../embeds/response.embeds';
import { AttendanceService } from '../services/attendanceService';
import { BotStateService } from '../services/botStateService';
import { syncBotAvatar } from '../services/botProfileService';
import { RankingService } from '../services/rankingService';
import { scheduleAutoClose, scheduleRankingSnapshots } from '../services/autoCloseJob';
import { ScheduleService } from '../services/scheduleService';
import { logger } from '../utils/logger';

const PANEL_FETCH_LIMIT = 50;

function isAttendancePanelMessage(message: Message, botUserId: string): boolean {
  if (message.author.id !== botUserId) {
    return false;
  }

  const panelCustomIds = new Set<string>(Object.values(BUTTON_CUSTOM_IDS));

  return message.components.some((row) => {
    if (row.type !== ComponentType.ActionRow) {
      return false;
    }

    return row.components.some((component) => {
      if (!('customId' in component) || typeof component.customId !== 'string') {
        return false;
      }
      return panelCustomIds.has(component.customId);
    });
  });
}

async function ensureAttendancePanel(
  client: Client,
  channelId: string,
): Promise<void> {
  const channel = await client.channels.fetch(channelId);

  if (!channel || !(channel instanceof TextChannel)) {
    throw new Error(
      `ATTENDANCE_CHANNEL_ID no es un canal de texto válido: ${channelId}`,
    );
  }

  const botUser = client.user;
  if (!botUser) {
    throw new Error('El cliente de Discord no tiene usuario listo');
  }
  const botUserId = botUser.id;

  const embeds = [buildAttendancePanelEmbed()];
  const components = [buildAttendanceButtonRow()];

  const pinnedMessages = await channel.messages.fetchPinned();
  let existingPanel = pinnedMessages.find((message) =>
    isAttendancePanelMessage(message, botUserId),
  );

  if (!existingPanel) {
    const recentMessages = await channel.messages.fetch({
      limit: PANEL_FETCH_LIMIT,
    });
    existingPanel = recentMessages.find((message) =>
      isAttendancePanelMessage(message, botUserId),
    );
  }

  if (existingPanel) {
    await existingPanel.edit({ embeds, components });
    if (!existingPanel.pinned) {
      await existingPanel.pin().catch((error) => {
        logger.warn('No se pudo fijar el panel de asistencia existente:', error);
      });
    }
    logger.info(`Panel de asistencia actualizado en #${channel.name}`);
    return;
  }

  const panelMessage = await channel.send({ embeds, components });
  await panelMessage.pin().catch((error) => {
    logger.warn('No se pudo fijar el panel de asistencia:', error);
  });
  logger.info(`Panel de asistencia publicado en #${channel.name}`);
}

export function registerReadyWithInit(
  client: Client,
  attendanceService: AttendanceService,
  scheduleService: ScheduleService,
  botStateService: BotStateService,
  rankingService: RankingService,
  config: AppConfig,
): void {
  client.once(Events.ClientReady, async (readyClient) => {
    try {
      await attendanceService.initialize();
      await scheduleService.initialize();
      botStateService.attachClient(readyClient);
      try {
        await syncBotAvatar(readyClient);
      } catch (error) {
        logger.warn('No se pudo aplicar el avatar animado:', error);
      }
      await botStateService.refreshPresence();
      botStateService.startPolling();
      scheduleAutoClose(
        attendanceService,
        config.timezone,
        BUSINESS_RULES.autoClose.cronExpression,
      );
      scheduleRankingSnapshots(rankingService, config.timezone);
      await ensureAttendancePanel(
        readyClient,
        config.discord.attendanceChannelId,
      );
      logger.info(`Bot conectado como ${readyClient.user.tag}`);
      logger.info('Almacenamiento principal: MySQL (Sheets solo emergencia)');
    } catch (error) {
      logger.error('Error al inicializar el bot:', error);
      process.exit(1);
    }
  });
}
