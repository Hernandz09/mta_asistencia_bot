import { Client, Events } from 'discord.js';
import { asistenciaCommand } from '../commands/asistencia';
import { BotCommand, CommandContext } from '../types/command.type';

const commands: BotCommand[] = [asistenciaCommand];

const commandsByName = new Map(
  commands.map((command) => [command.data.name, command]),
);

export function getCommandsData() {
  return commands.map((command) => command.data.toJSON());
}

export function registerCommandHandler(
  client: Client,
  context: CommandContext,
): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commandsByName.get(interaction.commandName);
    if (!command) return;

    await command.execute(interaction, context);
  });
}
