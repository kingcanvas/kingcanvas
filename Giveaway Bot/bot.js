const { Client, GatewayIntentBits, Collection, EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const ms = require('ms');
// Make sure to do "npm i discord.js ms" so this works.

// Loads the token for the bot.
require('dotenv').config();
const token = process.env.DISCORD_TOKEN;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds|
        GatewayIntentBits.GuildMembers|
        GatewayIntentBits.GuildMessages|
        GatewayIntentBits.MessageContent|
        GatewayIntentBits.GuildReactions,
    ],
});

client.once('ready', () => {
    client.user.setPresence({ activities: [{ name: '/gcreate | By KingCanvas', type: 0 }], status: 'online' });
});

client.commands = new Collection();

// Store authorized users/roles (you might want to use a database for persistence you dont have to tho)
const authorizedUsers = new Set();
const authorizedRoles = new Set();

// Command Definitions
const gcreateCommand = {
    data: new SlashCommandBuilder()
        .setName('gcreate')
        .setDescription('Creates a new giveaway')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('The title of the giveaway')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('time')
                .setDescription('The duration of the giveaway (e.g., 1h, 30m, 1d)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('The description or prize of the giveaway')
                .setRequired(true)),
    permissions: true, // Only authorized users/roles can use this
    async execute(interaction, client) {
        const title = interaction.options.getString('title');
        const time = interaction.options.getString('time');
        const description = interaction.options.getString('description');
        const duration = ms(time);

        if (!duration || isNaN(duration) || duration <= 0) {
            return interaction.reply({ content: 'Invalid time format. Please use something like 1h, 30m, or 1d.', ephemeral: true });
        }

        const endTime = new Date(Date.now() + duration);

        const giveawayEmbed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(title)
            .setDescription(description)
            .addFields({ name: 'Ends At', value: `<t:${Math.floor(endTime / 1000)}:R>` })
            .setFooter({ text: 'React with 🎉 to enter!' });

        const message = await interaction.channel.send({ embeds: [giveawayEmbed] });
        await message.react('🎉');

        setTimeout(async () => {
            const reaction = await message.reactions.cache.get('🎉');
            if (!reaction) {
                return interaction.channel.send('No one entered the giveaway.');
            }
            const users = await reaction.users.fetch();
            const validUsers = users.filter(user => !user.bot);

            if (validUsers.size === 0) {
                return interaction.channel.send('No valid entries for the giveaway.');
            }

            const winner = validUsers.random();
            const winnerEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🎉 Giveaway Ended! 🎉')
                .setDescription(`Congratulations, ${winner}! You won **${title}**!\n${description}`)
                .setTimestamp();

            interaction.channel.send({ content: `Congratulations, ${winner}!`, embeds: [winnerEmbed] });
        }, duration);

        await interaction.reply({ content: `Giveaway created successfully!`, ephemeral: true });
    },
};

const geditCommand = {
    data: new SlashCommandBuilder()
        .setName('gedit')
        .setDescription('Edits an existing giveaway')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('The ID of the giveaway message')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('new_title')
                .setDescription('The new title of the giveaway'))
        .addStringOption(option =>
            option.setName('new_time')
                .setDescription('The new duration of the giveaway (e.g., 1h, 30m, 1d)'))
        .addStringOption(option =>
            option.setName('new_description')
                .setDescription('The new description or prize of the giveaway')),
    permissions: true, // Only authorized users/roles can use this :)
    async execute(interaction, client) {
        const messageId = interaction.options.getString('message_id');
        const newTitle = interaction.options.getString('new_title');
        const newTime = interaction.options.getString('new_time');
        const newDescription = interaction.options.getString('new_description');

        try {
            const message = await interaction.channel.messages.fetch(messageId);
            if (!message.author.id === client.user.id || !message.embeds[0]?.footer?.text.includes('React with 🎉 to enter!')) {
                return interaction.reply({ content: 'This is not a valid giveaway message from this bot.', ephemeral: true });
            }

            const existingEmbed = message.embeds[0];
            const updatedEmbed = new EmbedBuilder(existingEmbed);

            if (newTitle) {
                updatedEmbed.setTitle(newTitle);
            }
            if (newDescription) {
                updatedEmbed.setDescription(newDescription);
            }
            if (newTime) {
                const duration = ms(newTime);
                if (!duration || isNaN(duration) || duration <= 0) {
                    return interaction.reply({ content: 'Invalid new time format.', ephemeral: true });
                }
                const endTime = new Date(Date.now() + duration);
                updatedEmbed.fields = updatedEmbed.fields.filter(field => field.name !== 'Ends At');
                updatedEmbed.addFields({ name: 'Ends At', value: `<t:${Math.floor(endTime / 1000)}:R>` });

                // This is basic so might not work
                await interaction.reply({ content: 'Giveaway time edit is a more complex feature and not fully implemented in this basic version.', ephemeral: true });
            }

            await message.edit({ embeds: [updatedEmbed] });
            await interaction.reply({ content: 'Giveaway message updated successfully!', ephemeral: true });

        } catch (error) {
            console.error('Error editing giveaway:', error);
            await interaction.reply({ content: 'Could not find or edit the specified giveaway message.', ephemeral: true });
        }
    },
};

const grerollCommand = {
    data: new SlashCommandBuilder()
        .setName('greroll')
        .setDescription('Rerolls a finished giveaway to pick a new winner')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('The ID of the giveaway message to reroll')
                .setRequired(true)),
    permissions: true, // Only authorized users/roles can use this :)
    async execute(interaction, client) {
        const messageId = interaction.options.getString('message_id');

        try {
            const message = await interaction.channel.messages.fetch(messageId);
            if (!message.author.id === client.user.id || !message.embeds[0]?.footer?.text.includes('React with 🎉 to enter!')) {
                return interaction.reply({ content: 'This is not a valid giveaway message from this bot.', ephemeral: true });
            }

            const reaction = await message.reactions.cache.get('🎉');
            if (!reaction) {
                return interaction.reply({ content: 'No one reacted to this giveaway.', ephemeral: true });
            }
            const users = await reaction.users.fetch();
            const validUsers = users.filter(user => !user.bot);

            if (validUsers.size === 0) {
                return interaction.reply({ content: 'No valid entries to reroll.', ephemeral: true });
            }

            const newWinner = validUsers.random();
            const originalEmbed = message.embeds[0];
            const rerollEmbed = new EmbedBuilder(originalEmbed)
                .setColor('#FFA500') // Orange color for reroll
                .setDescription(`🎉 **Reroll!** 🎉\nCongratulations, ${newWinner}! You are the new winner!`);

            await interaction.channel.send({ content: `New winner: ${newWinner}!`, embeds: [rerollEmbed] });
            await interaction.reply({ content: 'Giveaway rerolled successfully!', ephemeral: true });

        } catch (error) {
            console.error('Error rerolling giveaway:', error);
            await interaction.reply({ content: 'Could not find the specified giveaway message.', ephemeral: true });
        }
    },
};

const gpermCommand = {
    data: new SlashCommandBuilder()
        .setName('gperm')
        .setDescription('Adds a user or role to the giveaway command permissions')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add_user')
                .setDescription('Adds a user to the permission list')
                .addUserOption(option => option.setName('user').setDescription('The user to add').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove_user')
                .setDescription('Removes a user from the permission list')
                .addUserOption(option => option.setName('user').setDescription('The user to remove').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add_role')
                .setDescription('Adds a role to the permission list')
                .addRoleOption(option => option.setName('role').setDescription('The role to add').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove_role')
                .setDescription('Removes a role from the permission list')
                .addRoleOption(option => option.setName('role').setDescription('The role to remove').setRequired(true))),
    permissions: true, // Only authorized users/roles can use this command itself (admin level)
    async execute(interaction, client, authorizedUsers, authorizedRoles) {
        console.log('gperm command execute function called.'); // Debugging line
        if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
            console.log('User does not have administrator permission.'); // Debugging line
            return interaction.reply({ content: 'You need administrator permissions to manage giveaway permissions.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'add_user') {
            const user = interaction.options.getUser('user');
            authorizedUsers.add(user.id);
            await interaction.reply({ content: `User ${user.tag} has been added to the giveaway command permissions.`, ephemeral: true });
        } else if (subcommand === 'remove_user') {
            const user = interaction.options.getUser('user');
            authorizedUsers.delete(user.id);
            await interaction.reply({ content: `User ${user.tag} has been removed from the giveaway command permissions.`, ephemeral: true });
        } else if (subcommand === 'add_role') {
            const role = interaction.options.getRole('role');
            authorizedRoles.add(role.id);
            await interaction.reply({ content: `Role ${role.name} has been added to the giveaway command permissions.`, ephemeral: true });
        } else if (subcommand === 'remove_role') {
            const role = interaction.options.getRole('role');
            authorizedRoles.delete(role.id);
            await interaction.reply({ content: `Role ${role.name} has been removed from the giveaway command permissions.`, ephemeral: true });
        }
    },
};

// Add commands to the client's collection
client.commands.set(gcreateCommand.data.name, gcreateCommand);
client.commands.set(geditCommand.data.name, geditCommand);
client.commands.set(grerollCommand.data.name, grerollCommand);
client.commands.set(gpermCommand.data.name, gpermCommand);

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);

    // Register slash commands (takes time itz6b)
    const guild = client.guilds.cache.get('SERVER-ID'); // server id
    if (guild) {
        const commandData = client.commands.map(command => command.data.toJSON());
        guild.commands.set(commandData)
            .then(() => console.log('Successfully registered application commands.'))
            .catch(console.error);
    } else {
        console.warn('Could not find the specified guild to register commands.');
    }
});

client.on('interactionCreate', async interaction => {
    console.log(`Interaction command name: ${interaction.commandName}`); // Debugging line
    if (!interaction.isCommand()) return;

    const command = client.commands.get(interaction.commandName);
    console.log(`Found command: ${command}`); // Debugging line

    if (!command) return;

    try {
        console.log(`Executing command: ${command.data.name}`); // Debugging line
        await command.execute(interaction, client, authorizedUsers, authorizedRoles);
    } catch (error) {
        console.error(error);
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
    }
});

client.login(token);