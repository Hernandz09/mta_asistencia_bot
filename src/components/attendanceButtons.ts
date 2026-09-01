import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import {
  MTA_CONTACT_BUTTON_LABEL,
  MTA_WEBSITE_URL,
} from '../config/branding';
import { BUTTON_CUSTOM_IDS } from '../config/constants';

export function buildAttendanceButtonRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(BUTTON_CUSTOM_IDS.MARCAR_ENTRADA)
      .setLabel('Marcar Entrada')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(BUTTON_CUSTOM_IDS.MARCAR_SALIDA)
      .setLabel('Marcar Salida')
      .setEmoji('🚪')
      .setStyle(ButtonStyle.Primary),
  );
}

export function buildMtaContactButtonRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel(MTA_CONTACT_BUTTON_LABEL)
      .setEmoji('💬')
      .setStyle(ButtonStyle.Link)
      .setURL(MTA_WEBSITE_URL),
    new ButtonBuilder()
      .setLabel('Compra ahora')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Link)
      .setURL(MTA_WEBSITE_URL),
  );
}

export function buildAttendancePanelComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [buildAttendanceButtonRow(), buildMtaContactButtonRow()];
}
