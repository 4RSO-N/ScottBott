const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('imagine')
        .setDescription('Generate images with AI using Hugging Face FLUX')
        .addStringOption(option =>
            option.setName('prompt')
                .setDescription('Describe the image you want to generate')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('count')
                .setDescription('Number of images to generate (1-4, default: 1)')
                .setMinValue(1)
                .setMaxValue(4))
        .addStringOption(option =>
            option.setName('size')
                .setDescription('Image size (default: 1024x1024)')
                .addChoices(
                    { name: 'Square (1024x1024)', value: '1024x1024' },
                    { name: 'Portrait (768x1024)', value: '768x1024' },
                    { name: 'Landscape (1024x768)', value: '1024x768' }
                )),

    async execute(interaction, aiRouter, imageQueue, presetManager) {
        const prompt = interaction.options.getString('prompt');
        const size = interaction.options.getString('size') || '1024x1024';
        const count = interaction.options.getInteger('count') || 1;
        const [width, height] = size.split('x').map(Number);

        // Defer reply since image generation takes time
        await interaction.deferReply();

        try {
            // Use aiRouter passed as parameter
            if (!aiRouter) {
                throw new Error('AI Router not available');
            }
            
            // Generate multiple images if count > 1
            if (count === 1) {
                const result = await aiRouter.generateImage(prompt, {
                    width,
                    height,
                    userId: interaction.user.id,
                    username: interaction.user.username
                });

                await interaction.editReply(result);
            } else {
                await this.generateMultipleImages(interaction, aiRouter, prompt, width, height, count);
            }

        } catch (error) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Image Generation Failed')
                .setDescription(error.message || 'An error occurred while generating the image.')
                .setColor(0xff0000);

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },

    async generateMultipleImages(interaction, aiRouter, prompt, width, height, count) {
        const files = [];
        
        // Update status
        await interaction.editReply({ content: `🎨 Generating ${count} images...` });
        
        for (let i = 0; i < count; i++) {
            try {
                const result = await aiRouter.generateImage(prompt, {
                    width,
                    height,
                    userId: interaction.user.id,
                    username: interaction.user.username
                });
                
                if (result.files && result.files.length > 0) {
                    // Rename file to include number
                    result.files[0].name = `image-${i + 1}-${Date.now()}.png`;
                    files.push(result.files[0]);
                }
                
                // Small delay between requests to avoid rate limits
                if (i < count - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (err) {
                console.error(`Failed to generate image ${i + 1}:`, err);
            }
        }
        
        if (files.length === 0) {
            throw new Error('Failed to generate any images');
        }
        
        await interaction.editReply({
            content: `✨ Generated ${files.length}/${count} images!`,
            files: files
        });
    }
};