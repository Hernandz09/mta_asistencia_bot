import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
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
