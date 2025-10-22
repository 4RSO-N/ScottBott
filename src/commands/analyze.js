const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('analyze')
        .setDescription('Analyze an image using AI vision')
        .addAttachmentOption(option =>
            option.setName('image')
                .setDescription('Image to analyze')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('focus')
                .setDescription('What should I focus on?')
                .setRequired(false)
                .addChoices(
                    { name: 'General Description', value: 'general' },
                    { name: 'Objects & People', value: 'objects' },
                    { name: 'Colors & Composition', value: 'colors' },
                    { name: 'Text Recognition', value: 'text' },
                    { name: 'Artistic Analysis', value: 'artistic' }
                )),
    
    async execute(interaction, aiRouter) {
        await interaction.deferReply();

        try {
            const attachment = interaction.options.getAttachment('image');
            const focus = interaction.options.getString('focus') || 'general';

            // Validate image
            if (!attachment.contentType?.startsWith('image/')) {
                return await interaction.editReply({
                    content: '❌ Please upload a valid image file (PNG, JPG, GIF, etc.)',
                    ephemeral: true
                });
            }

            // Check file size (10MB limit)
            if (attachment.size > 10 * 1024 * 1024) {
                return await interaction.editReply({
                    content: '❌ Image is too large. Please upload an image smaller than 10MB.',
                    ephemeral: true
                });
            }

            // Create analysis prompt based on focus
            const prompts = {
                general: 'Describe this image in detail, including what you see, the setting, and any notable features.',
                objects: 'Identify and describe all objects, people, animals, and items visible in this image.',
                colors: 'Analyze the colors, composition, lighting, and visual elements of this image.',
                text: 'Identify and transcribe any text, signs, labels, or writing visible in this image.',
                artistic: 'Provide an artistic analysis of this image, including style, technique, mood, and aesthetic qualities.'
            };

            // Note: image analysis is disabled. We still validate file and show metadata.

            // Image analysis is disabled
            const analysisResult = {
                content: '❌ Image analysis is disabled.',
                embeds: []
            };

            const embed = {
                title: '🔍 Image Analysis Complete',
                description: analysisResult.content,
                color: 0x4285f4,
                fields: [
                    {
                        name: '📊 Analysis Focus',
                        value: focus.charAt(0).toUpperCase() + focus.slice(1),
                        inline: true
                    },
                    {
                        name: '📁 File Info',
                        value: `**Size:** ${Math.round(attachment.size / 1024)}KB\n**Format:** ${attachment.contentType}`,
                        inline: true
                    }
                ],
                image: {
                    url: attachment.url
                },
                footer: {
                    text: 'Image analysis currently disabled'
                },
                timestamp: new Date().toISOString()
            };

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in analyze command:', error);
            await interaction.editReply({
                content: '❌ Sorry, I couldn\'t analyze the image. Please make sure it\'s a valid image file and try again.',
                ephemeral: true
            });
        }
    }
};